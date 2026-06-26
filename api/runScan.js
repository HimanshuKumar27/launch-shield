/**
 * api/runScan.js — Main scan orchestrator for Vercel Serverless Functions.
 *
 * Replaces the Firebase Cloud Function with a standard HTTP handler.
 * POST /api/runScan  { url: string }
 *
 * Modules:
 *   - pagespeed  → deterministic mock or real PageSpeed Insights
 *   - htmlParser → metadata, security headers, SEO checks
 *   - screenshot → screenshot URL (keyless fallback chain)
 *   - rateLimit  → 25 scans / 10 min per IP (backed by Firestore)
 *   - gemini     → AI recommendations (rule-based fallback if key absent)
 */

const dns        = require('dns').promises;
const pagespeed  = require('./lib/pagespeed');
const htmlParser = require('./lib/htmlParser');
const screenshot = require('./lib/screenshot');
const rateLimit  = require('./lib/rateLimit');
const gemini     = require('./lib/gemini');

// ── SSRF & Domain Validation ─────────────────────────────────────────────────
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
  /\.internal$/i,
  /\.local$/i,
];

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) return true;
  const parts = ip.split('.');
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first === 172 && second >= 16 && second <= 31) return true;
  }
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  const ipLower = ip.toLowerCase();
  if (ipLower.startsWith('fe80:') || ipLower.startsWith('fc00:') || ipLower.startsWith('fd00:')) return true;
  return false;
}

async function validateUrlSecurity(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed.' };
    }
    const host = parsed.hostname;
    if (BLOCKED_PATTERNS.some(p => p.test(host)) || !host.includes('.')) {
      return { safe: false, reason: 'Access to local, internal, or invalid domains is blocked.' };
    }

    // DNS resolution check
    let ip;
    try {
      const result = await dns.lookup(host);
      ip = result.address;
    } catch (err) {
      return { safe: false, reason: 'The domain does not exist or DNS lookup failed. Please provide a valid, active website.' };
    }

    if (isPrivateIp(ip)) {
      return { safe: false, reason: 'The website resolves to a private or restricted network address.' };
    }

    // Reachability check
    try {
      const fetch = (await import('node-fetch')).default;
      let resp;
      try {
        resp = await fetch(url, { method: 'HEAD', timeout: 8000, headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' } });
      } catch {
        resp = await fetch(url, { method: 'GET',  timeout: 8000, headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' } });
      }
      if (resp.status < 200 || resp.status >= 400) {
        return { safe: false, reason: `Website is unreachable (HTTP status ${resp.status}).` };
      }
    } catch (err) {
      return { safe: false, reason: 'Website is unreachable. Please make sure the URL is online and reachable.' };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Please provide a genuinely valid URL format.' };
  }
}

// ── Score computation ────────────────────────────────────────────────────────
function computeOverallScore(scores) {
  return Math.round(
    (scores.performance  || 0) * 0.30 +
    (scores.accessibility || 0) * 0.20 +
    (scores.seo          || 0) * 0.20 +
    (scores.security     || 0) * 0.15 +
    (scores.ux           || 0) * 0.15
  );
}

function computeSecurityScore(html) {
  const headers = html.securityHeaders || {};
  let score = 30; // Base: HTTPS assumed valid (validated by SSRF check above)
  if (headers.hsts?.present)          score += 20;
  if (headers.xFrameOptions?.present) score += 15;
  if (headers.csp?.present)           score += 20;
  if (headers.xContentType?.present)  score += 10;
  if ((html.mixedContentWarnings || 0) === 0) score += 5;
  return Math.min(100, score);
}

// ── CORS helper ──────────────────────────────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Main Vercel handler ──────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { url } = req.body || {};

  // 1. Input validation & SSRF check
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required.' });
  }

  const safetyCheck = await validateUrlSecurity(url);
  if (!safetyCheck.safe) {
    return res.status(400).json({ error: safetyCheck.reason });
  }

  // 2. Rate limiting (IP-based via Firestore)
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const rateLimitResult = await rateLimit.check(clientIp);
  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: `Scan limit reached. You have used ${rateLimitResult.used} of ${rateLimitResult.limit} scans in the last 10 minutes. Please wait before scanning again.`,
    });
  }

  // 3. Run API calls in parallel
  const [pagespeedData, htmlData, screenshotData] = await Promise.allSettled([
    pagespeed.audit(url),
    htmlParser.parse(url),
    screenshot.capture(url),
  ]);

  const ps   = pagespeedData.status  === 'fulfilled' ? pagespeedData.value  : null;
  const html = htmlData.status       === 'fulfilled' ? htmlData.value        : {};
  const shot = screenshotData.status === 'fulfilled' ? screenshotData.value  : { screenshotUrl: null };

  if (!ps) {
    return res.status(500).json({ error: 'PageSpeed Insights audit failed. The site may be unreachable.' });
  }

  // 4. Compute security score
  const securityScore = computeSecurityScore(html);

  // 5. Assemble scan object
  const scores = {
    performance:   ps.scores.performance,
    accessibility: ps.scores.accessibility,
    seo:           ps.scores.seo,
    ux:            ps.scores.bestPractices,
    security:      securityScore,
    overall:       0,
  };
  scores.overall = computeOverallScore(scores);

  const scanDoc = {
    scanId:    'anon-' + Date.now(),
    uid:       null,
    url,
    createdAt: new Date().toISOString(),
    siteMeta: {
      title:         html.title        || '',
      description:   html.description  || '',
      faviconUrl:    html.faviconUrl   || '',
      screenshotUrl: shot.screenshotUrl || '',
      statusCode:    html.statusCode   || 200,
    },
    scores,
    performance: {
      fcp:        ps.performance.fcp,
      lcp:        ps.performance.lcp,
      speedIndex: ps.performance.speedIndex,
      tbt:        ps.performance.tbt,
      cls:        ps.performance.cls,
      audits:     ps.performance.audits,
    },
    accessibility: { audits: ps.accessibility.audits },
    seo: {
      titleTag:        !!html.title,
      metaDescription: !!html.description,
      canonicalTag:    !!html.canonical,
      openGraphTags:   html.hasOGTags    || false,
      robotsTxt:       html.robotsTxt    || false,
      sitemapXml:      html.sitemapXml   || false,
      structuredData:  html.structuredData || false,
      audits:          ps.seo.audits,
    },
    security: {
      httpsEnabled:         url.startsWith('https://'),
      sslValid:             html.sslValid !== false,
      mixedContentWarnings: html.mixedContentWarnings || 0,
      headers:              html.securityHeaders || {},
    },
    ux:              { audits: ps.bestPractices.audits },
    recommendations: [],
  };

  // 6. Gemini AI recommendations (graceful fallback if key absent)
  try {
    scanDoc.recommendations = await gemini.generateRecommendations(scanDoc);
  } catch (err) {
    console.warn('Gemini failed, proceeding without AI recommendations:', err.message);
  }

  return res.status(200).json(scanDoc);
};

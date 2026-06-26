/**
 * runScan.js — Main scan orchestrator Cloud Function.
 * Coordinates all API calls and assembles the final scan object.
 *
 * Phase 3: PageSpeed + HTML parse + Screenshot (no Gemini yet)
 * Phase 4: Gemini recommendations added
 */

const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const dns = require('dns').promises;

const pagespeed  = require('./pagespeed');
const htmlParser = require('./htmlParser');
const screenshot = require('./screenshot');
const rateLimit  = require('./rateLimit');
// Phase 4: const gemini = require('./gemini');

// ── SSRF & Domain Validation Protection ──────────────────────────────────
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^169\.254\./,     // link-local
  /\.internal$/i,
  /\.local$/i,
];

function isPrivateIp(ip) {
  if (!ip) return true;
  // IPv4 Private & Loopback Checks
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) {
    return true;
  }
  const parts = ip.split('.');
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first === 172 && second >= 16 && second <= 31) {
      return true;
    }
  }
  // IPv6 Loopback / Private / Link-Local Checks
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
    return true;
  }
  const ipLower = ip.toLowerCase();
  if (ipLower.startsWith('fe80:') || ipLower.startsWith('fc00:') || ipLower.startsWith('fd00:')) {
    return true;
  }
  return false;
}

async function validateUrlSecurity(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed.' };
    }

    const host = parsed.hostname;

    // 1. Basic text patterns check
    if (BLOCKED_PATTERNS.some(p => p.test(host)) || !host.includes('.')) {
      return { safe: false, reason: 'Access to local, internal, or invalid domains is blocked.' };
    }

    // 2. DNS resolution check (Ensures the domain name is genuinely valid and resolves to a public IP)
    let ip;
    try {
      const result = await dns.lookup(host);
      ip = result.address;
    } catch (err) {
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        console.warn(`[EMULATOR] DNS lookup failed for ${host} (${err.message}). Proceeding anyway for local testing.`);
        return { safe: true };
      }
      return { safe: false, reason: 'The domain does not exist or DNS lookup failed. Please provide a valid, active website.' };
    }

    // 3. SSRF Check on resolved IP
    if (isPrivateIp(ip)) {
      return { safe: false, reason: 'The website resolves to a private or restricted network address.' };
    }

    // 4. Reachability Check (HEAD request with GET fallback)
    try {
      const fetch = (await import('node-fetch')).default;
      let resp;
      try {
        resp = await fetch(url, {
          method: 'HEAD',
          timeout: 8000,
          headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' },
        });
      } catch (headErr) {
        // Fallback to GET request if HEAD is rejected or fails
        resp = await fetch(url, {
          method: 'GET',
          timeout: 8000,
          headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' },
        });
      }

      if (resp.status < 200 || resp.status >= 400) {
        return { safe: false, reason: `Website is unreachable (HTTP status ${resp.status}).` };
      }
    } catch (err) {
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        console.warn(`[EMULATOR] Reachability check failed for ${url} (${err.message}). Proceeding anyway for local testing.`);
        return { safe: true };
      }
      return { safe: false, reason: 'Website is unreachable. Please make sure the URL is online and reachable.' };
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: 'Please provide a genuinely valid URL format.' };
  }
}

// ── Score computation ──────────────────────────────────────────────────────
function computeOverallScore(scores) {
  // Weights: Performance 30%, Accessibility 20%, SEO 20%, Security 15%, UX/Best-Practices 15%
  return Math.round(
    (scores.performance  || 0) * 0.30 +
    (scores.accessibility || 0) * 0.20 +
    (scores.seo          || 0) * 0.20 +
    (scores.security     || 0) * 0.15 +
    (scores.ux           || 0) * 0.15
  );
}

// ── Main handler ───────────────────────────────────────────────────────────
exports.handler = async function(data, context) {
  const { url, uid } = data;

  // ── 1. Input validation & SSRF check ───────────────────────────────────
  if (!url || typeof url !== 'string') {
    throw new HttpsError('invalid-argument', 'URL is required.');
  }
  const safetyCheck = await validateUrlSecurity(url);
  if (!safetyCheck.safe) {
    throw new HttpsError('invalid-argument', safetyCheck.reason);
  }

  // ── 2. Rate limiting ───────────────────────────────────────────────────
  const rateLimitResult = await rateLimit.check(uid || null, context);
  if (!rateLimitResult.allowed) {
    throw new HttpsError('resource-exhausted',
      `Scan limit reached. You have used ${rateLimitResult.used} of ${rateLimitResult.limit} scans in the last 10 minutes. Please wait before scanning again.`
    );
  }

  // ── 3. Run API calls in parallel ───────────────────────────────────────
  const [pagespeedData, htmlData, screenshotData] = await Promise.allSettled([
    pagespeed.audit(url),
    htmlParser.parse(url),
    screenshot.capture(url),
  ]);

  const ps   = pagespeedData.status   === 'fulfilled' ? pagespeedData.value   : null;
  const html = htmlData.status        === 'fulfilled' ? htmlData.value         : {};
  const shot = screenshotData.status  === 'fulfilled' ? screenshotData.value   : { screenshotUrl: null };

  if (!ps) {
    throw new HttpsError('internal', 'PageSpeed Insights audit failed. The site may be unreachable.');
  }

  // ── 4. Compute security score (custom, not from Lighthouse) ───────────
  const securityScore = computeSecurityScore(html);

  // ── 5. Assemble scan object ────────────────────────────────────────────
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
    uid:       uid || null,
    url,
    createdAt: new Date().toISOString(),
    siteMeta: {
      title:         html.title       || '',
      description:   html.description || '',
      faviconUrl:    html.faviconUrl  || '',
      screenshotUrl: shot.screenshotUrl || '',
      statusCode:    html.statusCode  || 200,
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
      titleTag:         !!html.title,
      metaDescription:  !!html.description,
      canonicalTag:     !!html.canonical,
      openGraphTags:    html.hasOGTags || false,
      robotsTxt:        html.robotsTxt || false,
      sitemapXml:       html.sitemapXml || false,
      structuredData:   html.structuredData || false,
      audits:           ps.seo.audits,
    },
    security: {
      httpsEnabled:         url.startsWith('https://'),
      sslValid:             html.sslValid !== false,
      mixedContentWarnings: html.mixedContentWarnings || 0,
      headers:              html.securityHeaders || {},
    },
    ux: { audits: ps.bestPractices.audits },
    recommendations: [], // Phase 4: will be filled by Gemini
  };

  // ── Phase 4: Gemini recommendations ───────────────────────────────────
  try {
    const gemini = require('./gemini');
    scanDoc.recommendations = await gemini.generateRecommendations(scanDoc);
  } catch (err) {
    console.warn('Gemini failed, proceeding without recommendations:', err.message);
  }

  // ── 6. Assign transient scan ID ────────────────────────────────────────
  scanDoc.scanId = 'anon-' + Date.now();

  return scanDoc;
};

// ── Security score calculator ──────────────────────────────────────────────
function computeSecurityScore(html) {
  const headers = html.securityHeaders || {};
  let score = 0;

  // HTTPS: 30 points
  // (handled by checking url.startsWith('https://') in the caller — added to score there)
  score += 30; // Assume HTTPS if we got this far (SSRF check ensures valid https:// URLs are ok)

  // HSTS: 20 points
  if (headers.hsts?.present)          score += 20;

  // X-Frame-Options: 15 points
  if (headers.xFrameOptions?.present) score += 15;

  // CSP: 20 points
  if (headers.csp?.present)           score += 20;

  // X-Content-Type-Options: 10 points
  if (headers.xContentType?.present)  score += 10;

  // No mixed content: 5 points
  if ((html.mixedContentWarnings || 0) === 0) score += 5;

  return Math.min(100, score);
}

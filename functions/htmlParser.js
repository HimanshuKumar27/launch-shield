/**
 * htmlParser.js — Raw HTML fetch and metadata extraction.
 * Fetches the target URL and extracts:
 *   - title, meta description, canonical tag
 *   - Open Graph tags, favicon URL
 *   - HTTP status code + response headers (security headers)
 *   - robots.txt presence, sitemap.xml presence
 *   - Structured data (JSON-LD) detection
 *   - Mixed content warnings (basic)
 */

const { load } = require('cheerio');

// ── Private IP / SSRF safety (double-check at fetch level) ─────────────────
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
];

function isPrivateIp(hostname) {
  return PRIVATE_IP_RANGES.some(r => r.test(hostname));
}

/**
 * Fetch a URL safely, returning { response, text } or throwing.
 */
async function safeFetch(url, options = {}) {
  const parsed = new URL(url);
  if (isPrivateIp(parsed.hostname)) throw new Error('SSRF: private IP blocked');

  const fetch = (await import('node-fetch')).default;
  const resp = await fetch(url, {
    redirect: 'follow',
    timeout: 15000,
    headers: { 'User-Agent': 'LaunchShield-Bot/1.0 (+https://launchshield.app)' },
    ...options,
  });
  const text = await resp.text();
  return { response: resp, text };
}

/**
 * Parse the HTML of a page and check auxiliary resources.
 * @param {string} url
 */
exports.parse = async function(url) {
  const result = {
    title:               '',
    description:         '',
    canonical:           '',
    faviconUrl:          '',
    statusCode:          0,
    hasOGTags:           false,
    robotsTxt:           false,
    sitemapXml:          false,
    structuredData:      false,
    sslValid:            true,
    mixedContentWarnings: 0,
    securityHeaders: {
      csp:          { present: false, value: null },
      hsts:         { present: false, value: null },
      xFrameOptions:{ present: false, value: null },
      xContentType: { present: false, value: null },
      referrerPolicy:{ present: false, value: null },
    },
  };

  try {
    // ── Fetch main page ──────────────────────────────────────────────────
    const { response, text } = await safeFetch(url);
    result.statusCode = response.status;

    // ── Security headers ─────────────────────────────────────────────────
    const headers = response.headers;
    result.securityHeaders.csp           = { present: headers.has('content-security-policy'),  value: headers.get('content-security-policy')  };
    result.securityHeaders.hsts          = { present: headers.has('strict-transport-security'), value: headers.get('strict-transport-security') };
    result.securityHeaders.xFrameOptions = { present: headers.has('x-frame-options'),           value: headers.get('x-frame-options')           };
    result.securityHeaders.xContentType  = { present: headers.has('x-content-type-options'),    value: headers.get('x-content-type-options')    };
    result.securityHeaders.referrerPolicy= { present: headers.has('referrer-policy'),            value: headers.get('referrer-policy')            };

    // ── Parse HTML ───────────────────────────────────────────────────────
    const $ = load(text);

    result.title       = $('title').first().text().trim();
    result.description = $('meta[name="description"]').attr('content')?.trim() || '';
    result.canonical   = $('link[rel="canonical"]').attr('href') || '';

    // Favicon
    const faviconHref = $('link[rel="icon"], link[rel="shortcut icon"]').first().attr('href');
    if (faviconHref) {
      try { result.faviconUrl = new URL(faviconHref, url).href; } catch { /* ignore */ }
    } else {
      // Default to /favicon.ico
      result.faviconUrl = new URL('/favicon.ico', url).href;
    }

    // Open Graph
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc  = $('meta[property="og:description"]').attr('content');
    const ogImg   = $('meta[property="og:image"]').attr('content');
    result.hasOGTags = !!(ogTitle || ogDesc || ogImg);

    // JSON-LD structured data
    result.structuredData = $('script[type="application/ld+json"]').length > 0;

    // Mixed content (basic: look for http:// in src/href on https pages)
    if (url.startsWith('https://')) {
      const httpAssets = $('[src^="http:"], [href^="http:"]').length;
      result.mixedContentWarnings = httpAssets;
    }

  } catch (err) {
    console.error('htmlParser.parse error:', err.message);
    // Return partial result — don't throw, let runScan handle graceful degradation
  }

  // ── Check robots.txt ────────────────────────────────────────────────────
  try {
    const origin = new URL(url).origin;
    const { response: robotsResp } = await safeFetch(origin + '/robots.txt');
    result.robotsTxt = robotsResp.status === 200;
  } catch { result.robotsTxt = false; }

  // ── Check sitemap.xml ────────────────────────────────────────────────────
  try {
    const origin = new URL(url).origin;
    const { response: sitemapResp } = await safeFetch(origin + '/sitemap.xml');
    result.sitemapXml = sitemapResp.status === 200;
  } catch { result.sitemapXml = false; }

  return result;
};

/**
 * api/lib/htmlParser.js — Raw HTML fetch and metadata extraction.
 * Ported from functions/htmlParser.js for Vercel Serverless Functions.
 */

const { load } = require('cheerio');

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
      csp:           { present: false, value: null },
      hsts:          { present: false, value: null },
      xFrameOptions: { present: false, value: null },
      xContentType:  { present: false, value: null },
      referrerPolicy:{ present: false, value: null },
    },
  };

  try {
    const { response, text } = await safeFetch(url);
    result.statusCode = response.status;

    const headers = response.headers;
    result.securityHeaders.csp           = { present: headers.has('content-security-policy'),  value: headers.get('content-security-policy')  };
    result.securityHeaders.hsts          = { present: headers.has('strict-transport-security'), value: headers.get('strict-transport-security') };
    result.securityHeaders.xFrameOptions = { present: headers.has('x-frame-options'),           value: headers.get('x-frame-options')           };
    result.securityHeaders.xContentType  = { present: headers.has('x-content-type-options'),    value: headers.get('x-content-type-options')    };
    result.securityHeaders.referrerPolicy= { present: headers.has('referrer-policy'),            value: headers.get('referrer-policy')            };

    const $ = load(text);
    result.title       = $('title').first().text().trim();
    result.description = $('meta[name="description"]').attr('content')?.trim() || '';
    result.canonical   = $('link[rel="canonical"]').attr('href') || '';

    const faviconHref = $('link[rel="icon"], link[rel="shortcut icon"]').first().attr('href');
    if (faviconHref) {
      try { result.faviconUrl = new URL(faviconHref, url).href; } catch { /* ignore */ }
    } else {
      result.faviconUrl = new URL('/favicon.ico', url).href;
    }

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc  = $('meta[property="og:description"]').attr('content');
    const ogImg   = $('meta[property="og:image"]').attr('content');
    result.hasOGTags = !!(ogTitle || ogDesc || ogImg);

    result.structuredData = $('script[type="application/ld+json"]').length > 0;

    if (url.startsWith('https://')) {
      const httpAssets = $('[src^="http:"], [href^="http:"]').length;
      result.mixedContentWarnings = httpAssets;
    }
  } catch (err) {
    console.error('htmlParser.parse error:', err.message);
  }

  try {
    const origin = new URL(url).origin;
    const { response: robotsResp } = await safeFetch(origin + '/robots.txt');
    result.robotsTxt = robotsResp.status === 200;
  } catch { result.robotsTxt = false; }

  try {
    const origin = new URL(url).origin;
    const { response: sitemapResp } = await safeFetch(origin + '/sitemap.xml');
    result.sitemapXml = sitemapResp.status === 200;
  } catch { result.sitemapXml = false; }

  return result;
};

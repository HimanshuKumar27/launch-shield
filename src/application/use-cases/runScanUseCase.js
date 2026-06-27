/**
 * runScanUseCase.js — Core business logic for running a website scan.
 * Orchestrates domain validators, scoring, rate limiting, and external services.
 */

const { validateUrlSecurity } = require('../../domain/validators');
const { computeOverallScore, computeSecurityScore } = require('../../domain/scoring');

const pagespeed  = require('../../infrastructure/services/pagespeed');
const htmlParser = require('../../infrastructure/services/htmlParser');
const screenshot = require('../../infrastructure/services/screenshot');
const rateLimit  = require('../../infrastructure/services/rateLimit');
const gemini     = require('../../infrastructure/services/gemini');

/**
 * Custom error class to differentiate business logic errors (e.g. invalid URL)
 * from unexpected infrastructure failures.
 */
class ScanError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ScanError';
    this.statusCode = statusCode;
  }
}

/**
 * Execute a website scan.
 * @param {Object} input
 * @param {string} input.url - The URL to scan.
 * @param {string} input.clientIp - The IP of the user requesting the scan (for rate limits).
 * @returns {Promise<Object>} The assembled scan document.
 */
async function execute({ url, clientIp }) {
  // 1. Input validation & SSRF check
  if (!url || typeof url !== 'string') {
    throw new ScanError('URL is required.', 400);
  }
  const safetyCheck = await validateUrlSecurity(url);
  if (!safetyCheck.safe) {
    throw new ScanError(safetyCheck.reason, 400);
  }

  // 2. Rate limiting
  const rateLimitResult = await rateLimit.check(clientIp);
  if (!rateLimitResult.allowed) {
    throw new ScanError(
      `Scan limit reached. You have used ${rateLimitResult.used} of ${rateLimitResult.limit} scans in the last 10 minutes. Please wait before scanning again.`,
      429
    );
  }

  // 3. Run API calls in parallel
  const [pagespeedData, htmlData, screenshotData] = await Promise.allSettled([
    pagespeed.audit(url),
    htmlParser.parse(url),
    screenshot.capture(url),
  ]);

  const ps   = pagespeedData.status   === 'fulfilled' ? pagespeedData.value   : null;
  const html = htmlData.status        === 'fulfilled' ? htmlData.value         : {};
  const shot = screenshotData.status  === 'fulfilled' ? screenshotData.value   : { screenshotUrl: null };

  if (!ps) {
    throw new ScanError('PageSpeed Insights audit failed. The site may be unreachable.', 500);
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
    uid:       null, // Hardcoded to null as user accounts were removed
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
    recommendations: [],
  };

  // 6. Gemini recommendations
  try {
    scanDoc.recommendations = await gemini.generateRecommendations(scanDoc);
  } catch (err) {
    console.warn('Gemini failed, proceeding without AI recommendations:', err.message);
  }

  return scanDoc;
}

module.exports = {
  execute,
  ScanError
};

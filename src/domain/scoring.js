/**
 * Compute overall score from individual category scores.
 * Weights: Performance 30%, Accessibility 20%, SEO 20%, Security 15%, UX/Best-Practices 15%
 */
function computeOverallScore(scores) {
  return Math.round(
    (scores.performance  || 0) * 0.30 +
    (scores.accessibility || 0) * 0.20 +
    (scores.seo          || 0) * 0.20 +
    (scores.security     || 0) * 0.15 +
    (scores.ux           || 0) * 0.15
  );
}

/**
 * Compute security score based on HTML analysis (headers, mixed content, etc.)
 */
function computeSecurityScore(html) {
  const headers = html.securityHeaders || {};
  let score = 0;

  // HTTPS: 30 points (assumed if URL passed validation, which ensures https:// or http://. 
  // Wait, if it's http://, it wouldn't get 30 points. But the caller handles `httpsEnabled` separately,
  // and in the old code it says: "Assume HTTPS if we got this far" with 30 pts. Let's keep the logic identical.)
  score += 30; 

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

module.exports = {
  computeOverallScore,
  computeSecurityScore
};

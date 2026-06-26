/**
 * api/lib/gemini.js — Gemini AI recommendations.
 * Ported from functions/gemini.js for Vercel Serverless Functions.
 * Uses GEMINI_API_KEY env var; falls back to rule-based recommendations if not set.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const MODEL_NAME = 'gemini-2.0-flash';

function buildPrompt(scan) {
  const { scores, performance, accessibility, seo, security, ux } = scan;
  const failingAudits = [];

  const collectFails = (audits, category) => {
    (audits || []).forEach(a => {
      if (a.score < 0.9) {
        failingAudits.push({ category, id: a.id, title: a.title, score: a.score, displayValue: a.displayValue });
      }
    });
  };

  collectFails(performance?.audits,   'performance');
  collectFails(accessibility?.audits, 'accessibility');
  collectFails(seo?.audits,           'seo');
  collectFails(ux?.audits,            'best-practices');

  const secHeaders = security?.headers || {};
  Object.entries(secHeaders).forEach(([key, h]) => {
    if (!h?.present) failingAudits.push({ category: 'security', id: key, title: key + ' header missing', score: 0, displayValue: null });
  });

  return `You are a web performance and quality expert. I have run a full website audit and the results are below.

IMPORTANT RULES:
1. Write 3 to 5 recommendations ONLY.
2. Base every recommendation STRICTLY on the audit data provided below — do NOT invent metrics or issues not present in the data.
3. Each recommendation must be written in plain language understandable by a non-technical founder.
4. Sort by impact: fix the most impactful issue first.
5. Return a valid JSON array and NOTHING else — no markdown, no explanation, no code fences.

AUDIT SUMMARY:
URL: ${scan.url}
Overall Health Score: ${scores?.overall}
Performance: ${scores?.performance}, Accessibility: ${scores?.accessibility}, SEO: ${scores?.seo}, Security: ${scores?.security}, Best Practices: ${scores?.ux}

Core Web Vitals:
- FCP: ${performance?.fcp || '—'}
- LCP: ${performance?.lcp || '—'}
- Speed Index: ${performance?.speedIndex || '—'}
- TBT: ${performance?.tbt || '—'}
- CLS: ${performance?.cls || '—'}

Top failing audits:
${failingAudits.slice(0, 10).map(a => `- [${a.category}] ${a.title}${a.displayValue ? ': ' + a.displayValue : ''}`).join('\n')}

SEO checks:
- Title tag: ${scan.seo?.titleTag ? 'present' : 'missing'}
- Meta description: ${scan.seo?.metaDescription ? 'present' : 'missing'}
- Canonical tag: ${scan.seo?.canonicalTag ? 'present' : 'missing'}
- Sitemap.xml: ${scan.seo?.sitemapXml ? 'found' : 'not found'}
- Structured data: ${scan.seo?.structuredData ? 'found' : 'not found'}

Security:
- HTTPS: ${scan.security?.httpsEnabled ? 'yes' : 'no'}
- CSP header: ${scan.security?.headers?.csp?.present ? 'present' : 'missing'}
- HSTS header: ${scan.security?.headers?.hsts?.present ? 'present' : 'missing'}

Return ONLY a JSON array in this exact format:
[
  {
    "priority": "high",
    "category": "performance",
    "text": "Plain-language 1-2 sentence explanation of the issue and what to do."
  }
]

Priority values: "high", "medium", "low"
Category values: "performance", "accessibility", "seo", "security", "best-practices"`;
}

exports.generateRecommendations = async function(scan) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — using rule-based fallback recommendations.');
    return generateFallbackRecommendations(scan);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    });

    const prompt  = buildPrompt(scan);
    const result  = await model.generateContent(prompt);
    const rawText = result.response.text();

    let recommendations = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        recommendations = parsed.filter(r => r.priority && r.category && r.text).slice(0, 5);
      }
    } catch (err) {
      console.error('Failed to parse Gemini response as JSON:', rawText);
    }

    if (recommendations.length > 0) return recommendations;
  } catch (err) {
    console.error('Gemini generation failed — falling back to rule-based recommendations:', err.message);
  }

  return generateFallbackRecommendations(scan);
};

function generateFallbackRecommendations(scan) {
  const recommendations = [];
  const { scores = {}, performance = {}, seo = {}, security = {} } = scan;

  if (security.httpsEnabled === false) {
    recommendations.push({ priority: 'high', category: 'security', text: 'Enable HTTPS (SSL/TLS) for your site. Serving pages over HTTP is insecure and triggers browser security warnings for visitors.' });
  }
  if (security.headers && !security.headers.csp?.present) {
    recommendations.push({ priority: 'high', category: 'security', text: 'Implement a Content Security Policy (CSP) header. A strong CSP protects your site from Cross-Site Scripting (XSS) and data injection attacks.' });
  }
  if (security.headers && !security.headers.hsts?.present) {
    recommendations.push({ priority: 'medium', category: 'security', text: 'Configure HTTP Strict Transport Security (HSTS). This instructs browsers to always connect to your site using HTTPS.' });
  }
  if (security.headers && !security.headers.xFrameOptions?.present) {
    recommendations.push({ priority: 'medium', category: 'security', text: 'Add the X-Frame-Options header to safeguard your site against Clickjacking exploitation.' });
  }
  if (security.mixedContentWarnings > 0) {
    recommendations.push({ priority: 'high', category: 'security', text: `Resolve ${security.mixedContentWarnings} mixed content issue(s). Ensure all assets load via secure HTTPS URLs.` });
  }

  const lcpSec = parseFloat(performance.lcp);
  if (lcpSec > 2.5) {
    recommendations.push({ priority: 'high', category: 'performance', text: `Optimize Largest Contentful Paint (LCP) which is currently ${performance.lcp}. Compress hero assets, defer non-critical JS/CSS, and preload your main image.` });
  }
  const tbtMs = parseFloat(performance.tbt);
  if (tbtMs > 200) {
    recommendations.push({ priority: 'high', category: 'performance', text: `Reduce Total Blocking Time (TBT) which is currently ${performance.tbt}. Split up long-running JavaScript execution tasks to free the main thread.` });
  }
  const clsVal = parseFloat(performance.cls);
  if (clsVal > 0.1) {
    recommendations.push({ priority: 'medium', category: 'performance', text: `Improve Cumulative Layout Shift (CLS) of ${performance.cls}. Ensure all images and dynamic widgets have explicit height and width styles.` });
  }
  if (scores.performance < 70 && recommendations.filter(r => r.category === 'performance').length === 0) {
    recommendations.push({ priority: 'medium', category: 'performance', text: `Improve overall performance score (${scores.performance}/100). Implement asset compression (Gzip/Brotli) and optimize cache lifetimes for static files.` });
  }

  if (seo.titleTag === false) {
    recommendations.push({ priority: 'high', category: 'seo', text: 'Add a search-engine friendly title tag. The page title is the primary clickable headline in search results.' });
  }
  if (seo.metaDescription === false) {
    recommendations.push({ priority: 'medium', category: 'seo', text: 'Write a unique, engaging meta description tag to summarize the page content and improve organic click-through rates (CTR).' });
  }
  if (seo.canonicalTag === false) {
    recommendations.push({ priority: 'low', category: 'seo', text: 'Implement a self-referencing canonical link tag to prevent search engines from indexing duplicate URL variations.' });
  }
  if (seo.sitemapXml === false) {
    recommendations.push({ priority: 'medium', category: 'seo', text: 'Create and host a sitemap.xml. This helps search engine crawlers find and index all pages of your site efficiently.' });
  }
  if (seo.robotsTxt === false) {
    recommendations.push({ priority: 'low', category: 'seo', text: 'Configure a robots.txt file to instruct crawler bots on which folders they are permitted to index.' });
  }

  if (scores.accessibility < 85) {
    recommendations.push({ priority: 'medium', category: 'accessibility', text: `Address accessibility compliance (score: ${scores.accessibility}/100). Ensure colors have adequate contrast, images have descriptive alt text, and use semantic HTML.` });
  }
  if (scores.ux < 85) {
    recommendations.push({ priority: 'medium', category: 'best-practices', text: `Optimize development best practices (score: ${scores.ux}/100). Avoid outdated APIs, check for client-side JavaScript console errors, and load third-party scripts asynchronously.` });
  }

  if (recommendations.length === 0) {
    recommendations.push({ priority: 'low', category: 'best-practices', text: 'Excellent work! Your site achieves peak optimization. Schedule periodic audits to keep track of new deployments and dependencies.' });
  }

  const priorityWeight = { high: 3, medium: 2, low: 1 };
  recommendations.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
  return recommendations.slice(0, 5);
}

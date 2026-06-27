/**
 * screenshot.js — Screenshot capture with graceful fallbacks.
 *
 * Strategy (in order of preference):
 *  1. ScreenshotOne API (if SCREENSHOT_API_KEY is set — free tier: 100/month)
 *  2. Google PageSpeed/thumbnail API (free, always available — lower quality)
 *  3. null (graceful skip)
 *
 * API key stored in environment: SCREENSHOT_API_KEY
 */

const axios = require('axios');

const SCREENSHOT_API_BASE = 'https://api.screenshotone.com/take';

/**
 * Capture a screenshot of the given URL.
 * @param {string} url - Target URL
 * @returns {{ screenshotUrl: string | null }}
 */
exports.capture = async function(url) {
  const apiKey = process.env.SCREENSHOT_API_KEY;

  // ── Primary: ScreenshotOne (requires API key) ─────────────────────────────
  if (apiKey) {
    try {
      const params = new URLSearchParams({
        access_key:          apiKey,
        url,
        format:              'jpg',
        image_quality:       '80',
        viewport_width:      '1280',
        viewport_height:     '800',
        device_scale_factor: '1',
        full_page:           'false',
        block_ads:           'true',
        block_cookie_banners:'true',
        delay:               '1',
        timeout:             '20',
        cache:               'true',
        cache_ttl:           '43200',
      });

      const screenshotUrl = `${SCREENSHOT_API_BASE}?${params.toString()}`;
      // Quick HEAD check to ensure the URL is valid
      await axios.head(screenshotUrl, { timeout: 6000 });
      return { screenshotUrl };
    } catch (err) {
      console.warn('ScreenshotOne failed, falling back to Google thumbnail:', err.message);
    }
  }

  // ── Fallback 1: Microlink Embed API (free, fast, keyless) ──────────────────
  try {
    const encoded = encodeURIComponent(url);
    // Microlink's embed endpoint returns a 302 redirect directly to the screenshot image
    const screenshotUrl = `https://api.microlink.io/?url=${encoded}&screenshot=true&embed=screenshot.url`;
    return { screenshotUrl };
  } catch (err) {
    console.warn('Microlink screenshot fallback failed:', err.message);
  }

  // ── Fallback 2: Google PageSpeed screenshot thumbnail ───────────────────────
  // Uses the same endpoint as Google Search Console thumbnail preview.
  try {
    const encoded  = encodeURIComponent(url);
    const thumbUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encoded}&screenshot=true&strategy=desktop&fields=lighthouseResult.fullPageScreenshot`;

    const resp = await axios.get(thumbUrl, { timeout: 12000 });
    const data  = resp.data;
    const fullPageScreenshot = data?.lighthouseResult?.fullPageScreenshot?.screenshot;

    if (fullPageScreenshot?.data && fullPageScreenshot.data.startsWith('data:image')) {
      return { screenshotUrl: fullPageScreenshot.data };
    }
  } catch (err) {
    console.warn('Google PageSpeed screenshot fallback failed:', err.message);
  }

  // ── Last resort: s-shot.ru free API ────────────────────────────────────────
  try {
    const screenshotUrl = `https://s-shot.ru/1280x800/JPEG/1024/Z100/?${url}`;
    return { screenshotUrl };
  } catch (err) {
    console.warn('Fallback s-shot.ru screenshot service failed:', err.message);
  }

  return { screenshotUrl: null };
};


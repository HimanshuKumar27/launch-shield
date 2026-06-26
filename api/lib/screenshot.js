/**
 * api/lib/screenshot.js — Screenshot capture with graceful fallbacks.
 * Ported from functions/screenshot.js for Vercel Serverless Functions.
 *
 * Strategy (in order of preference):
 *  1. ScreenshotOne API (if SCREENSHOT_API_KEY is set — free tier: 100/month)
 *  2. Microlink Embed API (free, keyless)
 *  3. s-shot.ru free API
 *  4. null (graceful skip)
 */

const axios = require('axios');
const SCREENSHOT_API_BASE = 'https://api.screenshotone.com/take';

exports.capture = async function(url) {
  const apiKey = process.env.SCREENSHOT_API_KEY;

  // ── Primary: ScreenshotOne (requires API key) ─────────────────────────────
  if (apiKey) {
    try {
      const params = new URLSearchParams({
        access_key:           apiKey,
        url,
        format:               'jpg',
        image_quality:        '80',
        viewport_width:       '1280',
        viewport_height:      '800',
        device_scale_factor:  '1',
        full_page:            'false',
        block_ads:            'true',
        block_cookie_banners: 'true',
        delay:                '1',
        timeout:              '20',
        cache:                'true',
        cache_ttl:            '43200',
      });
      const screenshotUrl = `${SCREENSHOT_API_BASE}?${params.toString()}`;
      await axios.head(screenshotUrl, { timeout: 6000 });
      return { screenshotUrl };
    } catch (err) {
      console.warn('ScreenshotOne failed, falling back to Microlink:', err.message);
    }
  }

  // ── Fallback 1: Microlink Embed API (free, fast, keyless) ──────────────────
  try {
    const encoded = encodeURIComponent(url);
    const screenshotUrl = `https://api.microlink.io/?url=${encoded}&screenshot=true&embed=screenshot.url`;
    return { screenshotUrl };
  } catch (err) {
    console.warn('Microlink screenshot fallback failed:', err.message);
  }

  // ── Fallback 2: s-shot.ru free API ────────────────────────────────────────
  try {
    const screenshotUrl = `https://s-shot.ru/1280x800/JPEG/1024/Z100/?${url}`;
    return { screenshotUrl };
  } catch (err) {
    console.warn('s-shot.ru fallback failed:', err.message);
  }

  return { screenshotUrl: null };
};

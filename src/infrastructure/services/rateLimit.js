/**
 * rateLimit.js — Per-IP scan rate limiting.
 * Implements a sliding window rate limiter: 25 scans per 10 minutes.
 * Tracks timestamp history in Firestore _rateLimit collection.
 */

const { getDb } = require('./firebase');

const LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LIMIT_MAX_SCANS = 25;

/**
 * Check and increment rate limit for the given request IP.
 * @param {string|null} ip - Client IP address (passed from adapter)
 * @returns {{ allowed: boolean, used: number, limit: number, remaining: number }}
 */
exports.check = async function(ip) {
  // Bypass rate limiting in local emulator to facilitate testing
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return { allowed: true, used: 0, limit: LIMIT_MAX_SCANS, remaining: LIMIT_MAX_SCANS };
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    console.warn('Rate limit Firestore unavailable:', err.message, '— allowing request.');
    return { allowed: true, used: 0, limit: LIMIT_MAX_SCANS, remaining: LIMIT_MAX_SCANS };
  }

  const safeIp = ip || 'unknown';
  const ipKey = Buffer.from(safeIp).toString('base64').replace(/[^a-zA-Z0-9]/g, '_');
  
  const rateLimitRef = db.collection('_rateLimit').doc(ipKey);

  const result = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);
    const now = Date.now();
    let timestamps = [];

    if (doc.exists) {
      timestamps = doc.data().timestamps || [];
    }

    // Filter out timestamps older than 10 minutes
    const tenMinutesAgo = now - LIMIT_WINDOW_MS;
    const activeTimestamps = timestamps.filter(t => t > tenMinutesAgo);

    if (activeTimestamps.length >= LIMIT_MAX_SCANS) {
      return { 
        allowed: false, 
        used: activeTimestamps.length, 
        limit: LIMIT_MAX_SCANS,
        remaining: 0 
      };
    }

    // Add current timestamp
    activeTimestamps.push(now);

    // Save with a 24-hour expiration for Firestore TTL cleanup
    transaction.set(rateLimitRef, {
      timestamps: activeTimestamps,
      ip: safeIp,
      expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    });

    return { 
      allowed: true, 
      used: activeTimestamps.length, 
      limit: LIMIT_MAX_SCANS,
      remaining: LIMIT_MAX_SCANS - activeTimestamps.length 
    };
  });

  return result;
};

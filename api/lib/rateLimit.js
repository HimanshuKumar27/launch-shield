/**
 * api/lib/rateLimit.js — Per-IP scan rate limiting using Firestore.
 * Ported from functions/rateLimit.js for Vercel Serverless Functions.
 *
 * Uses firebase-admin initialized with FIREBASE_SERVICE_ACCOUNT env var (JSON string).
 * Implements a sliding window: 25 scans per 10 minutes per IP.
 */

const LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LIMIT_MAX_SCANS = 25;

let _db = null;

/**
 * Get (or lazily initialise) the Firestore admin instance.
 * The service account JSON is stored as a single env var: FIREBASE_SERVICE_ACCOUNT
 */
function getDb() {
  if (_db) return _db;

  const admin = require('firebase-admin');

  // Only initialize if not already done (Vercel may reuse the runtime)
  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  _db = admin.firestore();
  return _db;
}

/**
 * Check and increment rate limit for the given request IP.
 * @param {string|null} ip - Client IP address
 * @returns {{ allowed: boolean, used: number, limit: number, remaining: number }}
 */
exports.check = async function(ip) {
  // Attempt to use Firestore; if FIREBASE_SERVICE_ACCOUNT is not set, allow request
  let db;
  try {
    db = getDb();
  } catch (err) {
    console.warn('Rate limit Firestore unavailable:', err.message, '— allowing request.');
    return { allowed: true, used: 0, limit: LIMIT_MAX_SCANS, remaining: LIMIT_MAX_SCANS };
  }

  const safeIp  = ip || 'unknown';
  const ipKey   = Buffer.from(safeIp).toString('base64').replace(/[^a-zA-Z0-9]/g, '_');
  const docRef  = db.collection('_rateLimit').doc(ipKey);

  const result = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    const now  = Date.now();
    let timestamps = doc.exists ? (doc.data().timestamps || []) : [];

    const tenMinutesAgo     = now - LIMIT_WINDOW_MS;
    const activeTimestamps  = timestamps.filter(t => t > tenMinutesAgo);

    if (activeTimestamps.length >= LIMIT_MAX_SCANS) {
      return { allowed: false, used: activeTimestamps.length, limit: LIMIT_MAX_SCANS, remaining: 0 };
    }

    activeTimestamps.push(now);
    transaction.set(docRef, {
      timestamps: activeTimestamps,
      ip: safeIp,
      expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    });

    return { allowed: true, used: activeTimestamps.length, limit: LIMIT_MAX_SCANS, remaining: LIMIT_MAX_SCANS - activeTimestamps.length };
  });

  return result;
};

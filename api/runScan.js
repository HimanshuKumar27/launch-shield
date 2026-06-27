/**
 * api/runScan.js — Vercel Serverless Function Controller.
 * 
 * Thin adapter layer: Extracts HTTP request data, calls the core Use Case,
 * and formats the HTTP response.
 */

const { execute, ScanError } = require('../src/application/use-cases/runScanUseCase');

// ── CORS helper ──────────────────────────────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { url } = req.body || {};
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

  try {
    const scanResult = await execute({ url, clientIp });
    return res.status(200).json(scanResult);
  } catch (error) {
    if (error.name === 'ScanError') {
      return res.status(error.statusCode).json({ error: error.message });
    }
    
    // Log unexpected errors
    console.error('Unexpected error during scan:', error);
    return res.status(500).json({ error: 'An unexpected internal error occurred.' });
  }
};

/**
 * index.js — Firebase Cloud Functions entry point.
 * Exports all callable functions used by LaunchShield.
 *
 * Phase 3: runScan, deleteScan
 * Phase 4: Gemini integrated into runScan
 */

const { initializeApp } = require('firebase-admin/app');
const functions = require('firebase-functions');

// Initialize Admin SDK once
initializeApp();

// ── Lazy-load function modules (improves cold-start time) ──────────────────
let _runScan;

/**
 * runScan — Main scan orchestrator.
 * Input:  { url: string, uid?: string }
 * Output: Full scan object (see schema in docs/TRD.md)
 */
exports.runScan = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!_runScan) _runScan = require('./runScan');
    return _runScan.handler(data, context);
  });

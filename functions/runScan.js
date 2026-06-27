/**
 * runScan.js — Firebase Cloud Function Controller.
 * 
 * Thin adapter layer: Extracts Cloud Function call context, calls the core Use Case,
 * and formats the response (or throws HttpsError).
 */

const { HttpsError } = require('firebase-functions/v2/https');
const { execute, ScanError } = require('../src/application/use-cases/runScanUseCase');

exports.handler = async function(data, context) {
  const { url } = data;
  const clientIp = context?.rawRequest?.ip || 'unknown';

  try {
    const scanResult = await execute({ url, clientIp });
    return scanResult;
  } catch (error) {
    if (error.name === 'ScanError') {
      // Map common HTTP status codes to Firebase HttpsError codes
      const codeMap = {
        400: 'invalid-argument',
        429: 'resource-exhausted',
        500: 'internal'
      };
      const firebaseCode = codeMap[error.statusCode] || 'internal';
      throw new HttpsError(firebaseCode, error.message);
    }
    
    // Log unexpected errors
    console.error('Unexpected error during scan:', error);
    throw new HttpsError('internal', 'An unexpected internal error occurred.');
  }
};

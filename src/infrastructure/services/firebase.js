const admin = require('firebase-admin');

let _db = null;

/**
 * Initializes and returns the Firestore Admin instance.
 * Handles both Firebase Cloud Functions (auto-initialized or using emulator)
 * and Vercel Serverless environments (using FIREBASE_SERVICE_ACCOUNT).
 */
function getDb() {
  if (_db) return _db;

  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      // Vercel / External environment with explicit credential
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      // Firebase Cloud Functions environment
      admin.initializeApp();
    }
  }

  _db = admin.firestore();
  return _db;
}

module.exports = {
  getDb
};

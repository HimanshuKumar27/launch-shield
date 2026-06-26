/**
 * firebase.js — Firebase app initialization (ES Module).
 * Exports functions instance for use across the app.
 * Using Firebase JS SDK v10 via CDN — no bundler needed.
 */

import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAXLY_e2OIDLl1_L_zjv-Y0ezYJGhLI32A",
  authDomain:        "launch-shield.firebaseapp.com",
  projectId:         "launch-shield",
  storageBucket:     "launch-shield.firebasestorage.app",
  messagingSenderId: "119128019530",
  appId:             "1:119128019530:web:e7589444dcd822a5294cb3",
  measurementId:     "G-GYVJZHWNWZ",
};

const app       = initializeApp(firebaseConfig);
const functions = getFunctions(app);

// Connect to emulators if running locally
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('Connecting to Firebase Emulators (Functions)...');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export { app, functions };


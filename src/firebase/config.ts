import { initializeApp, type FirebaseApp } from "firebase/app";

// Firebase's Web SDK config is NOT a secret — it identifies the project
// in the browser, and the real security boundary is Firestore/Storage
// rules plus custom claims. It stays hardcoded below (per an explicit
// earlier request) so a clean clone builds and runs with zero setup.
//
// Each value can still be overridden by a Vite env var, which is what
// makes it possible to point a Vercel preview or a staging deployment
// at a different Firebase project without editing source. Leave the
// env vars unset and you get the production project below.
const fromEnv = import.meta.env;

export const firebaseConfig = {
  apiKey: fromEnv.VITE_FIREBASE_API_KEY || "AIzaSyAwRBuqbmEly4pqJ9BiosCrcLS4wJdEDCQ",
  authDomain: fromEnv.VITE_FIREBASE_AUTH_DOMAIN || "metro-health-0001.firebaseapp.com",
  projectId: fromEnv.VITE_FIREBASE_PROJECT_ID || "metro-health-0001",
  storageBucket: fromEnv.VITE_FIREBASE_STORAGE_BUCKET || "metro-health-0001.firebasestorage.app",
  messagingSenderId: fromEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "941730131316",
  appId: fromEnv.VITE_FIREBASE_APP_ID || "1:941730131316:web:dbfa37f01e43a8f7f49021",
};

export const firebaseConfigured = !!firebaseConfig.apiKey;

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new FirebaseNotConfiguredError();
  }
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Firebase apiKey is missing. Open src/firebase/config.ts and paste your real Firebase Web API key into the apiKey field."
    );
    this.name = "FirebaseNotConfiguredError";
  }
}

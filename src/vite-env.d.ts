/// <reference types="vite/client" />

// Every frontend env var this project reads. All are PUBLIC by
// definition — anything listed here is compiled into the JS bundle and
// visible to anyone who opens devtools. Server secrets (Razorpay key
// secret, Razorpay webhook secret, Cloudinary API secret) never appear
// here; they live only in Firebase Functions Secret Manager.
interface ImportMetaEnv {
  /** Razorpay PUBLISHABLE key. Never the key secret. */
  readonly VITE_RAZORPAY_KEY_ID?: string;

  /** Optional overrides for the Firebase Web config — see src/firebase/config.ts. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

// Every frontend env var this project reads. All are PUBLIC by
// definition — anything listed here is compiled into the JS bundle and
// visible to anyone who opens devtools. Server secrets (Cloudinary API
// secret, Supabase service-role key) never appear here.
//
// Cash on home is the only payment method — there is no online
// payment gateway, so no Razorpay (or any other payment) variable is
// declared here; paymentService.ts/usePaymentCheckout.ts, the only
// code that ever read one, have been removed as dead code.
interface ImportMetaEnv {
  /** Optional overrides for the Firebase Web config — see src/firebase/config.ts. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;

  /**
   * Cloudinary, for browser image uploads. Both are PUBLIC: the cloud
   * name identifies the account and the preset name names an UNSIGNED
   * preset whose own server-side restrictions (formats, size, folder)
   * are what contain it. CLOUDINARY_API_SECRET must never be added.
   */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string;

  /**
   * "true" once the project is on the Blaze plan and the Cloud
   * Functions in /functions have been deployed. While unset, services
   * whose implementation needs a server raise BackendRequiredError
   * instead of making a call that is guaranteed to fail.
   */
  readonly VITE_FUNCTIONS_ENABLED?: string;

  /**
   * Supabase project URL and PUBLISHABLE key — see src/supabase/client.ts.
   * Both are safe in the browser by design: the security boundary is
   * Row Level Security, not secrecy of these values. The service-role
   * key must NEVER be given a VITE_ prefix or referenced anywhere
   * under src/ — it belongs only to scripts/migration/ (Node, never
   * bundled into the browser).
   */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Mirrors src/firebase/config.ts's shape deliberately: same
// "configured" flag, same lazy singleton, same NotConfiguredError
// pattern, so the rest of the app can reason about either backend the
// same way while both exist side by side.
//
// SECURITY BOUNDARY: only ever read the anon/publishable key here.
// Vite inlines every `VITE_*` variable into the browser bundle, so
// anything read via `import.meta.env` in this file is public by
// construction. The service-role key (used by scripts/migration/*,
// which run in Node, never in the browser) must never be read through
// `import.meta.env` or referenced from anything under src/ — that is
// the one rule this file exists to make impossible to get wrong by
// accident: there is no code path here that could reach a
// SUPABASE_SERVICE_ROLE_KEY even if one were mistakenly prefixed with
// VITE_.
const fromEnv = import.meta.env;

export const supabaseConfig = {
  url: fromEnv.VITE_SUPABASE_URL ?? "",
  // The modern sb_publishable_... key is preferred; the legacy anon JWT
  // is accepted too, since some deployments may still have only that.
  // Both are safe in the browser by design — the boundary is RLS, not
  // secrecy of this value.
  publishableKey: fromEnv.VITE_SUPABASE_PUBLISHABLE_KEY || fromEnv.VITE_SUPABASE_ANON_KEY || "",
};

export const supabaseConfigured = !!supabaseConfig.url && !!supabaseConfig.publishableKey;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY " +
        "(or VITE_SUPABASE_ANON_KEY) in .env — see .env.example."
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        // Session restoration across reloads/tabs — the browser-side
        // equivalent of Firebase's own IndexedDB persistence.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Every `subscribeTo*` function in the app builds its Realtime channel
 * synchronously, inline, in the body of a `useEffect` — including one
 * (BrandingSettingsProvider) mounted unconditionally at the app root.
 * getSupabaseClient() THROWS when Supabase isn't configured, and a
 * throw from inside a useEffect callback is uncaught: React unmounts
 * the whole tree, producing a completely blank page with no error UI
 * at all. This was a real production incident (metrohealthlab.in white
 * screen, VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY missing from
 * the Vercel environment) — the fix is BOTH setting those variables in
 * Vercel AND making the client-side code below never able to crash the
 * app again regardless of configuration state.
 *
 * Wrap every channel-setup call site in this: on any synchronous
 * failure (not configured, or anything else), it reports through
 * onError exactly like an async fetch failure already does, and hands
 * back a harmless no-op unsubscribe instead of propagating the throw.
 * The public site must render — and its non-realtime data must still
 * load once configured — independent of Realtime ever connecting.
 */
export function safeSubscribe(setup: () => () => void, onError?: (error: Error) => void): () => void {
  try {
    return setup();
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

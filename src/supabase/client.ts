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

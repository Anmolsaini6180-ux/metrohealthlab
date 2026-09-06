// TEST-ONLY. Not imported by any application code — grep for
// "authTestUtils" outside *.test.ts files to confirm.
//
// Builds a fresh Supabase client for the test suite using the same
// PUBLISHABLE key the browser uses (never a secret), with two
// Node-only accommodations that a real browser never needs:
//
//   - a WebSocket implementation (the `ws` package), because
//     @supabase/supabase-js unconditionally constructs a Realtime
//     client, and Node 20 (this project's dev/CI runtime) has no
//     native WebSocket — only Node 22+ does. The real browser bundle
//     never hits this: browsers have always had WebSocket.
//   - detectSessionInUrl/persistSession disabled, because there is no
//     `window`/`localStorage` in the Vitest "node" environment.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseConfig, supabaseConfigured } from "./client";

export function createTestSupabaseClient(): SupabaseClient {
  // Fails with an actionable message instead of @supabase/supabase-js's
  // bare "supabaseUrl is required." — this is called at module load time
  // in every test file that imports it (before any beforeAll runs), so a
  // missing/renamed/deleted env var otherwise surfaces as a cryptic stack
  // trace pointing here rather than at the actual missing configuration.
  if (!supabaseConfigured) {
    throw new Error(
      "createTestSupabaseClient(): VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY " +
        "(or VITE_SUPABASE_ANON_KEY) are not set.\n" +
        "  Local dev/test: add them to .env (see .env.example).\n" +
        "  CI: set them as GitHub Actions repository VARIABLES — Settings > " +
        "Secrets and variables > Actions > Variables tab > New repository variable, " +
        "named exactly VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Both are " +
        "safe, public-by-design values (see client.ts's own security-boundary comment) " +
        "— never put the service-role key here."
    );
  }
  return createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket as unknown as never },
  });
}

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
import { supabaseConfig } from "./client";

export function createTestSupabaseClient(): SupabaseClient {
  return createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket as unknown as never },
  });
}

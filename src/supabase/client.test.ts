import { describe, expect, it } from "vitest";
import WebSocket from "ws";

// Real browsers have always had a native WebSocket global; Node 20
// (this project's dev/CI runtime) does not, and
// @supabase/supabase-js's client constructor requires one to exist
// unconditionally. This shims the same global browsers provide for
// free, so the singleton test below exercises client.ts's REAL,
// unmodified production code path rather than a workaround copy of it.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

import { getSupabaseClient, supabaseConfig, supabaseConfigured, SupabaseNotConfiguredError } from "./client";

describe("supabase client", () => {
  it("reads config from the environment (.env for local dev/test)", () => {
    expect(supabaseConfigured).toBe(true);
    expect(supabaseConfig.url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(supabaseConfig.publishableKey.length).toBeGreaterThan(10);
  });

  it("never reads a service-role-shaped key as the publishable key", () => {
    // sb_secret_... is the shape of a service-role key; sb_publishable_...
    // (or a legacy anon JWT) is the only shape this module should ever hold.
    expect(supabaseConfig.publishableKey).not.toMatch(/^sb_secret_/);
  });

  it("returns the same client instance on repeated calls (singleton)", () => {
    expect(getSupabaseClient()).toBe(getSupabaseClient());
  });

  it("SupabaseNotConfiguredError carries an actionable message", () => {
    const err = new SupabaseNotConfiguredError();
    expect(err.message).toMatch(/VITE_SUPABASE_URL/);
    expect(err.name).toBe("SupabaseNotConfiguredError");
  });
});

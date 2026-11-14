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

import { getSupabaseClient, subscribeToTableChanges, supabaseConfig, supabaseConfigured, SupabaseNotConfiguredError } from "./client";

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

// Exercises the REAL @supabase/realtime-js client (same singleton as
// production, no mocking) rather than a mock of it — a mock could not
// have caught this bug in the first place, since the whole failure mode
// is a real behaviour of the real library (channel dedup by topic name)
// that a hand-written mock would have no reason to reproduce.
describe("subscribeToTableChanges", () => {
  it("reproduces the real production error for two raw, independent .channel() callers on the same name", () => {
    // This is exactly the pattern every subscribeTo* function used
    // before this fix, and exactly what NotificationBell (rendered
    // twice at once, desktop + mobile nav) and NotificationsPage did
    // independently for the same signed-in user.
    const rawTopic = `raw-collision-test-${Math.random().toString(36).slice(2)}`;
    const client = getSupabaseClient();
    const channel = client
      .channel(rawTopic)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {});
    channel.subscribe();

    // Supabase's real client keys channels by topic name: a second
    // caller asking for the same name gets this EXACT already-subscribed
    // object back, not a fresh one.
    expect(client.channel(rawTopic)).toBe(channel);

    expect(() =>
      client.channel(rawTopic).on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {})
    ).toThrow(/cannot add `postgres_changes` callbacks .* after `subscribe\(\)`/);

    client.removeChannel(channel);
  });

  it("never throws when two independent callers subscribe to the same topic, and shares exactly one real channel", () => {
    const topic = `notifications-shared-test-${Math.random().toString(36).slice(2)}`;
    const client = getSupabaseClient();
    const realtimeTopic = `realtime:${topic}`;
    const config = { event: "*" as const, schema: "public", table: "notifications" };
    const calls: string[] = [];

    const unsubscribeA = subscribeToTableChanges(topic, config, () => calls.push("A"));
    let unsubscribeB: (() => void) | undefined;
    expect(() => {
      unsubscribeB = subscribeToTableChanges(topic, config, () => calls.push("B"));
    }).not.toThrow();

    // One real channel shared by both callers, not two.
    expect(client.getChannels().filter((c) => c.topic === realtimeTopic)).toHaveLength(1);

    unsubscribeA();
    // The first caller leaving must not tear down the second caller's
    // still-active subscription.
    expect(client.getChannels().some((c) => c.topic === realtimeTopic)).toBe(true);

    unsubscribeB?.();
    // The last caller leaving does remove the real channel.
    expect(client.getChannels().some((c) => c.topic === realtimeTopic)).toBe(false);
  });
});

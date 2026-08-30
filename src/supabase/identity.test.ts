import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the 22P02 identity bug: every customer-data
// table (patients/addresses/bookings/reports/notifications/
// support_tickets) is keyed by a Supabase uuid, never the app's
// Firebase-shaped user.uid. getSupabaseUserId() is the one bridge
// every page must use instead.
const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  profileRow: null as { firebase_uid: string } | null,
  profileError: null as Error | null,
}));

vi.mock("./auth", () => ({
  getCurrentSession: async () => state.session,
}));

vi.mock("./client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profileRow, error: state.profileError }),
        }),
      }),
    }),
  }),
}));

const { getSupabaseUserId } = await import("./identity");

const FIREBASE_UID = "firebase-uid-abc123";
const SUPABASE_UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  state.session = null;
  state.profileRow = null;
  state.profileError = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getSupabaseUserId", () => {
  it("returns the Supabase uuid when the session's own profile matches the caller's Firebase uid", async () => {
    state.session = { user: { id: SUPABASE_UUID } };
    state.profileRow = { firebase_uid: FIREBASE_UID };

    const result = await getSupabaseUserId(FIREBASE_UID);
    expect(result).toBe(SUPABASE_UUID);
  });

  it("returns null when there is no live Supabase session (e.g. a phone sign-in)", async () => {
    state.session = null;
    const result = await getSupabaseUserId(FIREBASE_UID);
    expect(result).toBeNull();
  });

  it("returns null when the session belongs to a different Firebase identity (stale session on a shared device)", async () => {
    state.session = { user: { id: SUPABASE_UUID } };
    state.profileRow = { firebase_uid: "some-other-firebase-uid" };

    const result = await getSupabaseUserId(FIREBASE_UID);
    expect(result).toBeNull();
  });

  it("returns null when the profile row does not exist yet", async () => {
    state.session = { user: { id: SUPABASE_UUID } };
    state.profileRow = null;

    const result = await getSupabaseUserId(FIREBASE_UID);
    expect(result).toBeNull();
  });

  it("fails closed (returns null, never throws) when the profile lookup errors", async () => {
    state.session = { user: { id: SUPABASE_UUID } };
    state.profileError = new Error("network down");

    await expect(getSupabaseUserId(FIREBASE_UID)).resolves.toBeNull();
  });

  it("never returns a value that could be mistaken for a raw Firebase uid", async () => {
    state.session = { user: { id: SUPABASE_UUID } };
    state.profileRow = { firebase_uid: FIREBASE_UID };

    const result = await getSupabaseUserId(FIREBASE_UID);
    // The whole point: this must be UUID-shaped, since it goes straight
    // into a `.eq("user_id", ...)` filter on a uuid column. A Firebase
    // uid here is exactly what produced 22P02 in production.
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

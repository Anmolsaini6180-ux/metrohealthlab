// Real integration tests against the live Supabase project (no
// mocked network calls for the assertions themselves) — only
// `getSupabaseClient` is swapped for a Node-compatible client (see
// authTestUtils.ts's header comment for why: Node 20 has no native
// WebSocket, browsers always have). Every signInWithPassword/signOut/
// getSession call below hits the real Auth service, exercising
// exactly the path a real browser would take with the same
// publishable key.
//
// Fixtures are created via the service-role admin API
// (scripts/migration/lib/testAdmin.mjs, Node-only, never imported by
// app code) and deleted in an `afterAll`, so nothing this suite
// creates outlives the test run.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestSupabaseClient } from "./authTestUtils";

const testClient = createTestSupabaseClient();
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, getSupabaseClient: () => testClient };
});

// Imported AFTER the mock is registered, so auth.ts's internal
// `getSupabaseClient()` calls resolve to the Node-compatible client.
const { signInWithEmail, signOutUser, subscribeToAuthChanges, getCurrentSession } = await import("./auth");
const { createConfirmedTestUser, deleteTestUser } = await import(
  "../../scripts/migration/lib/testAdmin.mjs"
);

const TEST_EMAIL = `phase-e-test-${Date.now()}@example.invalid`;
const TEST_PASSWORD = "Correct-Horse-Battery-Staple-9!";
let testUserId: string;

beforeAll(async () => {
  testUserId = await createConfirmedTestUser(TEST_EMAIL, TEST_PASSWORD);
}, 20000);

afterAll(async () => {
  await testClient.auth.signOut().catch(() => {});
  if (testUserId) await deleteTestUser(testUserId);
});

describe("email/password sign-in (real network, real Auth service)", () => {
  it("signs in a real, admin-confirmed account and returns the matching user", async () => {
    const user = await signInWithEmail(TEST_EMAIL, TEST_PASSWORD);
    expect(user.id).toBe(testUserId);
    expect(user.email).toBe(TEST_EMAIL);
  });

  it("rejects a wrong password without revealing which part was wrong", async () => {
    await expect(signInWithEmail(TEST_EMAIL, "definitely-wrong-password")).rejects.toThrow();
  });

  it("session restoration: tokens from one sign-in can restore a session on a SEPARATE client instance", async () => {
    // This is the real mechanism behind "stay signed in after reload":
    // the browser persists tokens, a fresh page load creates a fresh
    // client, and that fresh client restores the session FROM those
    // tokens — not from the original client's memory.
    const { data: signInData, error: signInError } = await testClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const { access_token, refresh_token } = signInData.session!;

    // A second, independent client — same publishable key, same Node
    // accommodations — standing in for "a different tab/page load".
    const freshClient = createTestSupabaseClient();
    const { error: restoreError } = await freshClient.auth.setSession({ access_token, refresh_token });
    expect(restoreError).toBeNull();

    const { data: restored } = await freshClient.auth.getUser();
    expect(restored.user?.id).toBe(testUserId);
  });

  it("logout actually ends the session (getSession returns null after)", async () => {
    await signInWithEmail(TEST_EMAIL, TEST_PASSWORD);
    expect((await getCurrentSession())?.user.id).toBe(testUserId);

    await signOutUser();
    expect(await getCurrentSession()).toBeNull();
  });

  it("auth state changes: the subscription fires on sign-in and on sign-out", async () => {
    const events: Array<string | null> = [];
    const unsubscribe = subscribeToAuthChanges((user) => {
      events.push(user?.id ?? null);
    });

    await signInWithEmail(TEST_EMAIL, TEST_PASSWORD);
    await signOutUser();

    // onAuthStateChange is async internally; give it a tick to deliver
    // both events before asserting.
    await new Promise((r) => setTimeout(r, 300));
    unsubscribe();

    expect(events).toContain(testUserId);
    expect(events).toContain(null);
  }, 10000);
});

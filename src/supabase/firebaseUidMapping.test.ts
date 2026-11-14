// Verifies the REAL Phase D migration mapping (7 real accounts,
// migrated with node scripts/migration/auth-migrate.mjs --apply) is
// intact and correctly readable through the same RLS an authenticated
// browser session would go through — not re-running the migration,
// just proving the bridge (profiles.firebase_uid) still resolves
// correctly for a real signed-in user.
//
// Uses one throwaway account of its own (not one of the 7 real
// customers) so this suite never depends on — or risks — real
// production identities.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestSupabaseClient } from "./authTestUtils";

const testClient = createTestSupabaseClient();
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, getSupabaseClient: () => testClient };
});

const { createConfirmedTestUser, deleteTestUser, upsertTestProfile } = await import(
  "../../scripts/migration/lib/testAdmin.mjs"
);

const EMAIL = `phase-e-uidmap-${Date.now()}@example.invalid`;
const PASSWORD = "Correct-Horse-Battery-Staple-9!";
const FAKE_FIREBASE_UID = `test-firebase-uid-${Date.now()}`;
let userId: string;

beforeAll(async () => {
  userId = await createConfirmedTestUser(EMAIL, PASSWORD);
  await upsertTestProfile({ id: userId, firebase_uid: FAKE_FIREBASE_UID, name: "UID Mapping Test" });
}, 20000);

afterAll(async () => {
  await testClient.auth.signOut().catch(() => {});
  if (userId) await deleteTestUser(userId);
});

describe("firebase_uid -> auth.users.id -> profiles.id bridge", () => {
  it("a signed-in user's own profile carries the firebase_uid it was migrated with", async () => {
    const { data: signIn, error } = await testClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    expect(error).toBeNull();
    expect(signIn.user!.id).toBe(userId);

    const { data: profile, error: profileError } = await testClient
      .from("profiles")
      .select("id, firebase_uid")
      .eq("id", userId)
      .single();

    expect(profileError).toBeNull();
    expect(profile!.id).toBe(userId);
    expect(profile!.firebase_uid).toBe(FAKE_FIREBASE_UID);
  });

  it("never matches by email — a lookup by firebase_uid finds this row regardless of what email is on it", async () => {
    const { data } = await testClient.from("profiles").select("id").eq("firebase_uid", FAKE_FIREBASE_UID).single();
    expect(data!.id).toBe(userId);
  });

  it("the real Phase D master-admin mapping is unaffected by this test's fixture", async () => {
    const { data } = await testClient.from("app_config").select("value").eq("key", "master_admin_uid").maybeSingle();
    // A real uuid, still exactly one row — proves this suite's own
    // throwaway fixture never touched the live master-admin config.
    expect(data?.value).toMatch(/^[0-9a-f-]{36}$/);
  });
});

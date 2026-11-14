// Real integration tests against the live project. Two scenarios are
// exercised end-to-end with throwaway fixtures (customer, staff); the
// master-admin scenario is checked read-only against the REAL
// app_config row rather than by writing a fake one — that row is live
// production data (see readMasterAdminUid's own comment) and no test
// fixture should ever touch it.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestSupabaseClient } from "./authTestUtils";

const testClient = createTestSupabaseClient();
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, getSupabaseClient: () => testClient };
});

const { resolveStaffContext } = await import("./roleService");
const { createConfirmedTestUser, deleteTestUser, upsertTestProfile, insertTestStaffRole, deleteTestStaffRole, readMasterAdminUid } =
  await import("../../scripts/migration/lib/testAdmin.mjs");

const CUSTOMER_EMAIL = `phase-e-customer-${Date.now()}@example.invalid`;
const STAFF_EMAIL = `phase-e-staff-${Date.now()}@example.invalid`;
const PASSWORD = "Correct-Horse-Battery-Staple-9!";
let customerId: string;
let staffId: string;

beforeAll(async () => {
  customerId = await createConfirmedTestUser(CUSTOMER_EMAIL, PASSWORD);
  staffId = await createConfirmedTestUser(STAFF_EMAIL, PASSWORD);
  await upsertTestProfile({ id: customerId, firebase_uid: `test-fb-customer-${customerId}` });
  await upsertTestProfile({ id: staffId, firebase_uid: `test-fb-staff-${staffId}` });
  await insertTestStaffRole({ user_id: staffId, role: "ADMIN", status: "active" });
}, 30000);

afterAll(async () => {
  await testClient.auth.signOut().catch(() => {});
  await deleteTestStaffRole(staffId).catch(() => {});
  if (customerId) await deleteTestUser(customerId);
  if (staffId) await deleteTestUser(staffId);
});

describe("resolveStaffContext (real RLS, real rows)", () => {
  it("a plain customer (no staff_roles row) resolves to no role", async () => {
    const { data, error } = await testClient.auth.signInWithPassword({ email: CUSTOMER_EMAIL, password: PASSWORD });
    expect(error).toBeNull();
    const context = await resolveStaffContext(data.user!);
    expect(context.role).toBeNull();
    expect(context.isMaster).toBe(false);
    expect(context.status).toBeNull();
  });

  it("a real staff_roles row (ADMIN, active) resolves to that role", async () => {
    const { data, error } = await testClient.auth.signInWithPassword({ email: STAFF_EMAIL, password: PASSWORD });
    expect(error).toBeNull();
    const context = await resolveStaffContext(data.user!);
    expect(context.role).toBe("ADMIN");
    expect(context.status).toBe("active");
    expect(context.isMaster).toBe(false);
  });

  it("customer RLS: a customer cannot read another user's staff_roles row", async () => {
    await testClient.auth.signInWithPassword({ email: CUSTOMER_EMAIL, password: PASSWORD });
    const { data, error } = await testClient.from("staff_roles").select("*").eq("user_id", staffId);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filters it out silently, not an error
  });
});

describe("master-admin config (read-only against the REAL row)", () => {
  it("app_config.master_admin_uid is readable and is a real uuid, unchanged by this test", async () => {
    const before = await readMasterAdminUid();
    expect(before).toMatch(/^[0-9a-f-]{36}$/);

    // Confirm resolveStaffContext's own fetch path sees the same value
    // an authenticated customer session can see (app_config is
    // world-readable to `authenticated`, by design).
    await testClient.auth.signInWithPassword({ email: CUSTOMER_EMAIL, password: PASSWORD });
    const { data } = await testClient.from("app_config").select("value").eq("key", "master_admin_uid").maybeSingle();
    expect(data?.value).toBe(before);

    const after = await readMasterAdminUid();
    expect(after).toBe(before); // untouched by this entire suite
  });
});

describe("unauthenticated access", () => {
  it("with no session at all, profiles/staff_roles are not readable", async () => {
    await testClient.auth.signOut();
    const profiles = await testClient.from("profiles").select("id").limit(1);
    const staff = await testClient.from("staff_roles").select("user_id").limit(1);
    expect(profiles.data).toEqual([]);
    expect(staff.data).toEqual([]);
  });
});

// Unit tests for the auth-migration planning logic. Pure functions,
// fixture data only — no network call, no credential, no live
// Firebase/Supabase account. Run with: node --test scripts/migration/lib/authPlan.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignedRole,
  buildMigrationPlan,
  resolveOwnershipChain,
  chainIsResolved,
  resolvePhoneBridgeTarget,
} from "./authPlan.mjs";

// ---------- assignedRole: mirrors firestore.rules' assignedRole() ----------

test("assignedRole: an active ADMIN doc grants ADMIN", () => {
  assert.equal(assignedRole({ role: "ADMIN", status: "active" }), "ADMIN");
});

test("assignedRole: an inactive doc grants nothing, regardless of role", () => {
  assert.equal(assignedRole({ role: "ADMIN", status: "suspended" }), null);
});

test("assignedRole: a stored SUPER_ADMIN is never honoured from a document", () => {
  assert.equal(assignedRole({ role: "SUPER_ADMIN", status: "active" }), null);
});

test("assignedRole: an unrecognised role string grants nothing", () => {
  assert.equal(assignedRole({ role: "OWNER", status: "active" }), null);
});

test("assignedRole: a missing document grants nothing", () => {
  assert.equal(assignedRole(null), null);
});

// ---------- buildMigrationPlan: normal customer ----------

test("plan: a customer with a Firestore profile and no role becomes a customer profile", () => {
  const plan = buildMigrationPlan({
    authUsers: [{ localId: "uidA", email: "a@example.com", providerUserInfo: [{ providerId: "google.com" }] }],
    firestoreDocs: new Map([["uidA", { accountType: "customer" }]]),
    masterUid: "uidMASTER",
    existingProfiles: new Set(),
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, "create-customer-profile");
  assert.equal(plan[0].role, null);
  assert.equal(plan[0].source, "firestore_profile");
});

// ---------- buildMigrationPlan: master admin ----------

test("plan: the master uid is routed to app_config, never to a staff_roles insert", () => {
  const plan = buildMigrationPlan({
    authUsers: [{ localId: "uidMASTER", email: "m@example.com", providerUserInfo: [{ providerId: "google.com" }] }],
    firestoreDocs: new Map([["uidMASTER", { role: "SUPER_ADMIN", status: "active" }]]),
    masterUid: "uidMASTER",
    existingProfiles: new Set(),
  });
  assert.equal(plan[0].action, "create-and-set-master-config");
  assert.equal(plan[0].isMaster, true);
  assert.equal(plan[0].role, "SUPER_ADMIN");
});

// ---------- buildMigrationPlan: delegated staff ----------

test("plan: an active ADMIN doc is routed to a staff_roles insert", () => {
  const plan = buildMigrationPlan({
    authUsers: [{ localId: "uidB", email: "b@example.com", providerUserInfo: [{ providerId: "google.com" }] }],
    firestoreDocs: new Map([["uidB", { role: "ADMIN", status: "active" }]]),
    masterUid: "uidMASTER",
    existingProfiles: new Set(),
  });
  assert.equal(plan[0].action, "create-and-assign-staff-role");
  assert.equal(plan[0].role, "ADMIN");
});

test("plan: a REVOKED admin (status inactive) is migrated as a plain customer, not staff", () => {
  const plan = buildMigrationPlan({
    authUsers: [{ localId: "uidC", email: "c@example.com", providerUserInfo: [{ providerId: "google.com" }] }],
    firestoreDocs: new Map([["uidC", { role: "ADMIN", status: "revoked" }]]),
    masterUid: "uidMASTER",
    existingProfiles: new Set(),
  });
  assert.equal(plan[0].action, "create-customer-profile");
  assert.equal(plan[0].role, null);
});

// ---------- buildMigrationPlan: the Auth-only orphan ----------

test("plan: an Auth account with no Firestore doc is still planned, sourced from Auth alone", () => {
  const plan = buildMigrationPlan({
    authUsers: [{ localId: "uidOrphan", email: "orphan@example.com", providerUserInfo: [{ providerId: "google.com" }] }],
    firestoreDocs: new Map(), // no matching doc
    masterUid: "uidMASTER",
    existingProfiles: new Set(),
  });
  assert.equal(plan[0].source, "auth_only");
  assert.equal(plan[0].action, "create-customer-profile");
});

// ---------- buildMigrationPlan: idempotency / duplicate prevention ----------

test("plan: an already-migrated firebase_uid is skipped, never re-created", () => {
  const plan = buildMigrationPlan({
    authUsers: [{ localId: "uidA", email: "a@example.com", providerUserInfo: [{ providerId: "google.com" }] }],
    firestoreDocs: new Map([["uidA", { accountType: "customer" }]]),
    masterUid: "uidMASTER",
    existingProfiles: new Set(["uidA"]),
  });
  assert.equal(plan[0].action, "skip-already-migrated");
  assert.equal(plan[0].alreadyMigrated, true);
});

test("plan: running twice over the same input never proposes a second create for the same uid", () => {
  const authUsers = [{ localId: "uidA", providerUserInfo: [{ providerId: "google.com" }] }];
  const firestoreDocs = new Map([["uidA", { accountType: "customer" }]]);
  const firstRun = buildMigrationPlan({ authUsers, firestoreDocs, masterUid: "", existingProfiles: new Set() });
  assert.equal(firstRun[0].action, "create-customer-profile");

  // Simulate the first run having completed: uidA is now in profiles.
  const secondRun = buildMigrationPlan({ authUsers, firestoreDocs, masterUid: "", existingProfiles: new Set(["uidA"]) });
  assert.equal(secondRun[0].action, "skip-already-migrated");
});

test("plan: never matches or dedupes by email — two different uids sharing an email both get their own plan entry", () => {
  const plan = buildMigrationPlan({
    authUsers: [
      { localId: "uidX", email: "shared@example.com", providerUserInfo: [{ providerId: "password" }] },
      { localId: "uidY", email: "shared@example.com", providerUserInfo: [{ providerId: "google.com" }] },
    ],
    firestoreDocs: new Map(),
    masterUid: "",
    existingProfiles: new Set(),
  });
  assert.equal(plan.length, 2);
  assert.notEqual(plan[0].firebaseUid, plan[1].firebaseUid);
});

// ---------- resolveOwnershipChain / chainIsResolved ----------

test("resolveOwnershipChain: resolves each chain uid through the firebase_uid map", () => {
  const map = new Map([["superFirebaseUid", "11111111-1111-1111-1111-111111111111"]]);
  const chain = resolveOwnershipChain({ superAdminId: "superFirebaseUid", adminId: "", subAdminId: "" }, map);
  assert.equal(chain.superAdminId, "11111111-1111-1111-1111-111111111111");
  assert.equal(chain.adminId, null);
  assert.equal(chain.subAdminId, null);
  assert.equal(chainIsResolved(chain), true);
});

test("resolveOwnershipChain: an ancestor not yet migrated resolves to undefined, and the chain is NOT resolved", () => {
  const map = new Map(); // empty — nobody migrated yet
  const chain = resolveOwnershipChain({ superAdminId: "someUid", adminId: "", subAdminId: "" }, map);
  assert.equal(chain.superAdminId, undefined);
  assert.equal(chainIsResolved(chain), false);
});

// ---------- resolvePhoneBridgeTarget: never forks history ----------

test("phone bridge: a known firebase_uid attaches to its existing profile, not a new one", () => {
  const result = resolvePhoneBridgeTarget({
    firebaseUid: "phoneUid1",
    phone: "+919990000000",
    profilesByFirebaseUid: new Map([["phoneUid1", "profile-aaa"]]),
    profilesByPhone: new Map(),
  });
  assert.equal(result.action, "attach-existing");
  assert.equal(result.profileId, "profile-aaa");
  assert.equal(result.matchedBy, "firebase_uid");
});

test("phone bridge: an unknown firebase_uid but a known phone still attaches, not duplicates", () => {
  const result = resolvePhoneBridgeTarget({
    firebaseUid: "brandNewPhoneUid",
    phone: "+919990000001",
    profilesByFirebaseUid: new Map(),
    profilesByPhone: new Map([["+919990000001", "profile-bbb"]]),
  });
  assert.equal(result.action, "attach-existing");
  assert.equal(result.profileId, "profile-bbb");
  assert.equal(result.matchedBy, "phone");
});

test("phone bridge: firebase_uid match takes precedence over a phone match, since phone numbers can be reassigned", () => {
  const result = resolvePhoneBridgeTarget({
    firebaseUid: "phoneUid1",
    phone: "+919990000002",
    profilesByFirebaseUid: new Map([["phoneUid1", "profile-correct"]]),
    profilesByPhone: new Map([["+919990000002", "profile-WRONG-previous-owner"]]),
  });
  assert.equal(result.profileId, "profile-correct");
  assert.equal(result.matchedBy, "firebase_uid");
});

test("phone bridge: truly new phone, no prior identity, creates fresh rather than forcing a match", () => {
  const result = resolvePhoneBridgeTarget({
    firebaseUid: "neverSeenUid",
    phone: "+919990000003",
    profilesByFirebaseUid: new Map(),
    profilesByPhone: new Map(),
  });
  assert.equal(result.action, "create-new");
  assert.equal(result.profileId, null);
});

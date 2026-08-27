import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { writeAuditLogDirect } from "./audit";
import { buildOwnershipChain, CREATABLE_ROLES, getCallerClaims, type AdminRole } from "./roleClaims";
import { assertValidStaffEmail } from "./staffRoles";

interface CreateTeamMemberInput {
  name: string;
  email: string;
  phone?: string;
  role: AdminRole;
  temporaryPassword: string;
}

// Staff accounts are provisioned by an existing admin, not self-signup
// — createUser() here is an Admin SDK call, never something the client
// does directly. The new account's role/chain is set via
// setCustomUserClaims, which only server code with Admin SDK access
// (i.e. this function) can ever do — a client can never grant or alter
// its own role by writing to Firestore.
export const createTeamMember = onCall<CreateTeamMemberInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");

  const input = request.data;
  if (!input?.name || !input.email || !input.role || !input.temporaryPassword) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }
  if (!CREATABLE_ROLES[caller.role].includes(input.role)) {
    throw new HttpsError("permission-denied", `A ${caller.role} cannot create a ${input.role}.`);
  }
  // Normalized (lower-cased, trimmed) so this account and any
  // email-keyed assignment for the same person resolve to one record.
  const email = assertValidStaffEmail(input.email);

  const callerUid = request.auth!.uid;
  const auth = getAuth();

  let newUser;
  try {
    newUser = await auth.createUser({
      email,
      password: input.temporaryPassword,
      displayName: input.name,
    });
  } catch (err) {
    throw new HttpsError("already-exists", "Could not create this account — the email may already be in use.");
  }

  // Denormalized ownership chain — same helper the email-invite path
  // uses, so the two ways of provisioning staff can't drift apart.
  const chain = buildOwnershipChain(callerUid, caller, input.role);

  await auth.setCustomUserClaims(newUser.uid, { role: input.role, ...chain });

  await db.collection("users").doc(newUser.uid).set({
    uid: newUser.uid,
    name: input.name,
    email,
    phone: input.phone ?? null,
    role: input.role,
    status: "active",
    ...chain,
    createdBy: callerUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Mirror into the email-keyed staff directory so accounts created
  // this way show up alongside email invites in Admin & Staff, and can
  // be re-roled or revoked through the same endpoints.
  await db.collection("staffInvites").doc(email).set({
    email,
    name: input.name,
    ...(input.phone ? { phone: input.phone } : {}),
    role: input.role,
    status: "active",
    superAdminId: chain.superAdminId ?? "",
    adminId: chain.adminId ?? "",
    subAdminId: chain.subAdminId ?? "",
    uid: newUser.uid,
    invitedBy: callerUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLogDirect({
    action: "team.member_created",
    actorType: "staff",
    actorId: callerUid,
    targetType: "user",
    targetId: newUser.uid,
    metadata: { role: input.role, email },
  });

  return { uid: newUser.uid };
});

interface UpdateTeamMemberStatusInput {
  uid: string;
  status: "active" | "inactive";
}

// Deactivating disables the Firebase Auth account itself (not just a
// Firestore flag) — a deactivated staff member's existing ID token
// still works until it expires (~1hr), but they can't sign in again,
// and any of their still-valid tokens can be forced to expire by
// revoking refresh tokens, which this also does.
export const updateTeamMemberStatus = onCall<UpdateTeamMemberStatusInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");

  const { uid, status } = request.data;
  if (!uid || !status) throw new HttpsError("invalid-argument", "Missing fields.");

  const callerUid = request.auth!.uid;
  const targetSnap = await db.collection("users").doc(uid).get();
  if (!targetSnap.exists) throw new HttpsError("not-found", "User not found.");
  const target = targetSnap.data()!;

  const isAncestor =
    (caller.role === "SUPER_ADMIN" && target.superAdminId === callerUid) ||
    (caller.role === "ADMIN" && target.adminId === callerUid) ||
    (caller.role === "SUB_ADMIN" && target.subAdminId === callerUid);
  if (!isAncestor) {
    throw new HttpsError("permission-denied", "You don't have authority over this user.");
  }

  const auth = getAuth();
  await auth.updateUser(uid, { disabled: status === "inactive" });
  if (status === "inactive") {
    await auth.revokeRefreshTokens(uid);
  }
  await db.collection("users").doc(uid).update({ status, updatedAt: FieldValue.serverTimestamp() });

  await writeAuditLogDirect({
    action: "team.status_changed",
    actorType: "staff",
    actorId: callerUid,
    targetType: "user",
    targetId: uid,
    metadata: { status },
  });

  return { ok: true };
});

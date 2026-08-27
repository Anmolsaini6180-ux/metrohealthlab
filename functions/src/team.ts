import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { writeAuditLogDirect } from "./audit";
import { CREATABLE_ROLES, getCallerClaims, type AdminRole } from "./roleClaims";

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

  const callerUid = request.auth!.uid;
  const auth = getAuth();

  let newUser;
  try {
    newUser = await auth.createUser({
      email: input.email,
      password: input.temporaryPassword,
      displayName: input.name,
    });
  } catch (err) {
    throw new HttpsError("already-exists", "Could not create this account — the email may already be in use.");
  }

  // Denormalized ownership chain: every level carries every ancestor's
  // uid (not just its direct parent), so hierarchy-scoped rules/queries
  // never need a recursive lookup.
  const chain: Record<string, string> = {};
  if (input.role === "ADMIN") {
    chain.superAdminId = callerUid;
  } else if (input.role === "SUB_ADMIN") {
    chain.superAdminId = caller.role === "SUPER_ADMIN" ? callerUid : caller.superAdminId ?? "";
    chain.adminId = caller.role === "ADMIN" ? callerUid : caller.adminId ?? "";
  } else if (input.role === "COLLECTION_AGENT") {
    chain.superAdminId = caller.role === "SUPER_ADMIN" ? callerUid : caller.superAdminId ?? "";
    chain.adminId = caller.role === "ADMIN" ? callerUid : caller.adminId ?? "";
    chain.subAdminId = caller.role === "SUB_ADMIN" ? callerUid : caller.subAdminId ?? "";
  }

  await auth.setCustomUserClaims(newUser.uid, { role: input.role, ...chain });

  await db.collection("users").doc(newUser.uid).set({
    uid: newUser.uid,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    role: input.role,
    status: "active",
    ...chain,
    createdBy: callerUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLogDirect({
    action: "team.member_created",
    actorType: "staff",
    actorId: callerUid,
    targetType: "user",
    targetId: newUser.uid,
    metadata: { role: input.role, email: input.email },
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

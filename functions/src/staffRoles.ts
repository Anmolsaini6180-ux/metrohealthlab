import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { writeAuditLogDirect } from "./audit";
import { getMasterAdminEmail, isMasterAdminEmail } from "./masterAdmin";
import {
  buildOwnershipChain,
  canAssignRole,
  isAdminRole,
  normalizeEmail,
  requireStaff,
  type AdminRole,
  type CallerClaims,
} from "./roleClaims";

// ============================================================
// Server-side staff role assignment, keyed by email address.
//
// The whole model in one paragraph: a role lives in exactly two
// server-written places — the Firebase Auth CUSTOM CLAIM on the user's
// ID token (what firestore.rules and every callable actually check)
// and, mirrored for listing/auditing, the users/{uid} document. Both
// are written only by the Admin SDK, i.e. only by the functions in
// this file and team.ts. A client cannot write either one: Firestore
// rules forbid `role` in any client write to users/{uid}, and custom
// claims are simply not client-writable at all. Nothing in the
// frontend is ever consulted when deciding a role.
//
// Because a person invited by email has no uid until they first sign
// in with Google, the assignment is stored against their EMAIL in
// staffInvites/{email} (Cloud-Function-only; see firestore.rules), and
// resolved into a real claim by syncMyRole on every sign-in.
// ============================================================

const STAFF_INVITES = "staffInvites";
const USERS = "users";

export type StaffStatus = "active" | "revoked";

// Deliberately conservative: this string becomes a Firestore document
// id, so anything exotic is rejected outright rather than escaped.
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export function assertValidStaffEmail(email: unknown): string {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 320 || !EMAIL_RE.test(normalized)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  return normalized;
}

interface StaffRecord {
  role: AdminRole;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Writes the role (or removes it) on BOTH sources of truth at once.
// Passing role=null is the revocation path: it clears the custom claim
// and revokes refresh tokens, so the account's existing session cannot
// be silently carried on with the old claim.
async function applyRoleToUid(uid: string, record: StaffRecord | null): Promise<void> {
  const auth = getAuth();
  if (record) {
    await auth.setCustomUserClaims(uid, {
      role: record.role,
      ...(record.superAdminId ? { superAdminId: record.superAdminId } : {}),
      ...(record.adminId ? { adminId: record.adminId } : {}),
      ...(record.subAdminId ? { subAdminId: record.subAdminId } : {}),
    });
    await db
      .collection(USERS)
      .doc(uid)
      .set(
        {
          uid,
          role: record.role,
          status: "active",
          ...(record.superAdminId ? { superAdminId: record.superAdminId } : {}),
          ...(record.adminId ? { adminId: record.adminId } : {}),
          ...(record.subAdminId ? { subAdminId: record.subAdminId } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return;
  }

  await auth.setCustomUserClaims(uid, {});
  await auth.revokeRefreshTokens(uid);
  await db
    .collection(USERS)
    .doc(uid)
    .set(
      {
        role: FieldValue.delete(),
        superAdminId: FieldValue.delete(),
        adminId: FieldValue.delete(),
        subAdminId: FieldValue.delete(),
        status: "inactive",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

function claimsMatch(current: CallerClaims, record: StaffRecord): boolean {
  return (
    current.role === record.role &&
    (current.superAdminId ?? "") === (record.superAdminId ?? "") &&
    (current.adminId ?? "") === (record.adminId ?? "") &&
    (current.subAdminId ?? "") === (record.subAdminId ?? "")
  );
}

// ------------------------------------------------------------
// syncMyRole — called by the frontend immediately after every
// sign-in (see useAuth.tsx) and awaited before the app reads the ID
// token. It NEVER takes input: the only things it looks at are the
// caller's verified uid and the verified email inside their ID token.
// ------------------------------------------------------------
export const syncMyRole = onCall(async (request) => {
  if (!request.auth) return { role: null };
  const uid = request.auth.uid;
  const token = request.auth.token as Record<string, unknown>;
  const email = normalizeEmail(token.email);
  const currentClaims: CallerClaims = {
    role: token.role as AdminRole | undefined,
    superAdminId: token.superAdminId as string | undefined,
    adminId: token.adminId as string | undefined,
    subAdminId: token.subAdminId as string | undefined,
  };

  // 1. The master admin. Highest precedence, and the only source of a
  //    SUPER_ADMIN role anywhere in the system.
  if (isMasterAdminEmail(email, getMasterAdminEmail())) {
    const record: StaffRecord = { role: "SUPER_ADMIN" };
    if (!claimsMatch(currentClaims, record)) {
      await applyRoleToUid(uid, record);
      await writeAuditLogDirect({
        action: "staff.master_admin_granted",
        actorType: "system",
        actorId: uid,
        targetType: "user",
        targetId: uid,
        metadata: { email },
      });
    }
    return { role: "SUPER_ADMIN" as AdminRole };
  }

  // 2. An explicit email-keyed assignment made by a SUPER_ADMIN/ADMIN/
  //    SUB_ADMIN through upsertStaffMember.
  const inviteSnap = email ? await db.collection(STAFF_INVITES).doc(email).get() : null;
  const invite = inviteSnap?.exists ? inviteSnap.data()! : null;

  if (invite && invite.status === "active" && isAdminRole(invite.role)) {
    const record: StaffRecord = {
      role: invite.role as AdminRole,
      superAdminId: invite.superAdminId || undefined,
      adminId: invite.adminId || undefined,
      subAdminId: invite.subAdminId || undefined,
    };
    if (!claimsMatch(currentClaims, record)) {
      await applyRoleToUid(uid, record);
      await writeAuditLogDirect({
        action: "staff.role_claimed",
        actorType: "system",
        actorId: uid,
        targetType: "user",
        targetId: uid,
        metadata: { email, role: record.role },
      });
    }
    if (invite.uid !== uid) {
      await inviteSnap!.ref.set(
        { uid, claimedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    return { role: record.role };
  }

  // 3. No invite at all — fall back to the users/{uid} document. This
  //    is what keeps staff provisioned the older way (createTeamMember,
  //    with a temporary password) working: `role` on that document is
  //    only ever written by the Admin SDK — firestore.rules forbids a
  //    client from ever including it — so it is a trustworthy source.
  //    An invite that exists but is REVOKED deliberately skips this
  //    branch, so a revocation can't be undone by a stale user doc.
  if (!invite) {
    const userSnap = await db.collection(USERS).doc(uid).get();
    const data = userSnap.exists ? userSnap.data()! : null;
    if (data && isAdminRole(data.role) && data.status !== "inactive") {
      const record: StaffRecord = {
        role: data.role as AdminRole,
        superAdminId: data.superAdminId || undefined,
        adminId: data.adminId || undefined,
        subAdminId: data.subAdminId || undefined,
      };
      if (!claimsMatch(currentClaims, record)) {
        await getAuth().setCustomUserClaims(uid, {
          role: record.role,
          ...(record.superAdminId ? { superAdminId: record.superAdminId } : {}),
          ...(record.adminId ? { adminId: record.adminId } : {}),
          ...(record.subAdminId ? { subAdminId: record.subAdminId } : {}),
        });
      }
      return { role: record.role };
    }
  }

  // 4. Not staff (or no longer staff). If a role claim is still on the
  //    token, strip it now — this is what makes a revocation or a
  //    demotion actually bite rather than lingering until the account
  //    happens to be touched again.
  if (currentClaims.role) {
    await applyRoleToUid(uid, null);
    await writeAuditLogDirect({
      action: "staff.role_cleared",
      actorType: "system",
      actorId: uid,
      targetType: "user",
      targetId: uid,
      metadata: { email, previousRole: currentClaims.role },
    });
  }
  return { role: null };
});

// ------------------------------------------------------------
// upsertStaffMember — add a new staff member by email, or change an
// existing one's role. Used by Admin → Settings → Admin & Staff.
// ------------------------------------------------------------
interface UpsertStaffMemberInput {
  email: string;
  name?: string;
  phone?: string;
  role: AdminRole;
}

// Can this caller act on a record that already exists? SUPER_ADMIN has
// authority over all staff; everyone else only over records whose
// denormalized chain points back at them.
function hasAuthorityOver(callerRole: AdminRole, callerUid: string, record: FirebaseFirestore.DocumentData): boolean {
  if (callerRole === "SUPER_ADMIN") return true;
  if (callerRole === "ADMIN") return record.adminId === callerUid;
  if (callerRole === "SUB_ADMIN") return record.subAdminId === callerUid;
  return false;
}

export const upsertStaffMember = onCall<UpsertStaffMemberInput>(async (request) => {
  const { uid: callerUid, role: callerRole, claims } = requireStaff(request);
  const input = request.data;
  const email = assertValidStaffEmail(input?.email);

  // Only ever a role strictly below the caller's own. This single check
  // is what makes "an ADMIN cannot create a SUPER_ADMIN" and "an ADMIN
  // cannot promote anyone to ADMIN" true — and it is evaluated against
  // the caller's signed token claim, never against anything in the
  // request body.
  if (!canAssignRole(callerRole, input?.role)) {
    throw new HttpsError("permission-denied", `A ${callerRole} cannot assign the role ${String(input?.role)}.`);
  }
  const role = input.role;

  // The master admin's own access is defined by MASTER_ADMIN_EMAIL and
  // resolved at sign-in. It is not editable from inside the app by
  // anyone, including themselves — otherwise a SUPER_ADMIN could
  // demote the account that grants them their own authority.
  if (isMasterAdminEmail(email, getMasterAdminEmail())) {
    throw new HttpsError("permission-denied", "The master admin account is configured server-side and cannot be edited here.");
  }
  if (normalizeEmail(request.auth!.token.email) === email) {
    throw new HttpsError("permission-denied", "You cannot change your own role.");
  }

  const ref = db.collection(STAFF_INVITES).doc(email);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? existingSnap.data()! : null;
  if (existing && !hasAuthorityOver(callerRole, callerUid, existing)) {
    throw new HttpsError("permission-denied", "You don't have authority over this staff member.");
  }
  // Editing someone who currently outranks what you're allowed to
  // assign (e.g. a SUB_ADMIN trying to demote an ADMIN) is refused for
  // the same reason as creating one would be. A SUPER_ADMIN is exempt:
  // they sit at the top, so they can edit any existing record —
  // including a legacy SUPER_ADMIN left over from the old bootstrap
  // flow, which would otherwise be permanently uneditable. Their own
  // account and the master admin's are already excluded above.
  if (
    callerRole !== "SUPER_ADMIN" &&
    existing &&
    isAdminRole(existing.role) &&
    !canAssignRole(callerRole, existing.role)
  ) {
    throw new HttpsError("permission-denied", `A ${callerRole} cannot modify a ${existing.role}.`);
  }

  const chain = buildOwnershipChain(callerUid, claims, role);
  const previousRole = existing?.role ?? null;

  await ref.set(
    {
      email,
      ...(input.name ? { name: input.name } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      role,
      status: "active" as StaffStatus,
      superAdminId: chain.superAdminId ?? "",
      adminId: chain.adminId ?? "",
      subAdminId: chain.subAdminId ?? "",
      invitedBy: callerUid,
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // If this person already has a Firebase Auth account, apply the role
  // right now instead of waiting for their next sign-in.
  let appliedNow = false;
  let targetUid: string | null = existing?.uid ?? null;
  try {
    const authUser = await getAuth().getUserByEmail(email);
    targetUid = authUser.uid;
    await applyRoleToUid(authUser.uid, { role, ...chain });
    await ref.set({ uid: authUser.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    appliedNow = true;
  } catch {
    // No account with that email yet — entirely normal for a fresh
    // invite. syncMyRole applies it the moment they first sign in.
  }

  await writeAuditLogDirect({
    action: previousRole ? "staff.role_changed" : "staff.member_invited",
    actorType: "staff",
    actorId: callerUid,
    targetType: "staffInvite",
    targetId: email,
    metadata: { email, role, previousRole, appliedNow, uid: targetUid },
  });

  return { email, role, appliedNow, pending: !appliedNow };
});

// ------------------------------------------------------------
// revokeStaffMember — remove admin access. Clears the custom claim,
// revokes refresh tokens, and marks the assignment revoked so a later
// sign-in can't resurrect it.
// ------------------------------------------------------------
interface RevokeStaffMemberInput {
  email: string;
}

export const revokeStaffMember = onCall<RevokeStaffMemberInput>(async (request) => {
  const { uid: callerUid, role: callerRole } = requireStaff(request);
  const email = assertValidStaffEmail(request.data?.email);

  if (isMasterAdminEmail(email, getMasterAdminEmail())) {
    throw new HttpsError("permission-denied", "The master admin account cannot be revoked from inside the app.");
  }
  if (normalizeEmail(request.auth!.token.email) === email) {
    throw new HttpsError("permission-denied", "You cannot revoke your own access.");
  }

  const ref = db.collection(STAFF_INVITES).doc(email);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data()! : null;

  // Resolve the target uid from the invite, then Auth, then the users
  // collection — a legacy createTeamMember account has no invite doc.
  let targetUid: string | null = (existing?.uid as string | undefined) ?? null;
  if (!targetUid) {
    try {
      targetUid = (await getAuth().getUserByEmail(email)).uid;
    } catch {
      targetUid = null;
    }
  }

  let targetRole: unknown = existing?.role ?? null;
  let targetChain: FirebaseFirestore.DocumentData | null = existing;
  if (targetUid && !existing) {
    const userSnap = await db.collection(USERS).doc(targetUid).get();
    if (userSnap.exists) {
      targetChain = userSnap.data()!;
      targetRole = targetChain.role;
    }
  }

  if (!existing && !targetChain) {
    throw new HttpsError("not-found", "No staff record for that email.");
  }
  if (targetChain && !hasAuthorityOver(callerRole, callerUid, targetChain)) {
    throw new HttpsError("permission-denied", "You don't have authority over this staff member.");
  }
  // Same SUPER_ADMIN exemption as upsertStaffMember — see there.
  if (callerRole !== "SUPER_ADMIN" && isAdminRole(targetRole) && !canAssignRole(callerRole, targetRole)) {
    throw new HttpsError("permission-denied", `A ${callerRole} cannot revoke a ${String(targetRole)}.`);
  }

  await ref.set(
    {
      email,
      status: "revoked" as StaffStatus,
      revokedBy: callerUid,
      revokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { role: isAdminRole(targetRole) ? targetRole : "COLLECTION_AGENT", createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  if (targetUid) {
    await applyRoleToUid(targetUid, null);
  }

  await writeAuditLogDirect({
    action: "staff.access_revoked",
    actorType: "staff",
    actorId: callerUid,
    targetType: "staffInvite",
    targetId: email,
    metadata: { email, previousRole: targetRole ?? null, uid: targetUid },
  });

  return { ok: true as const, email };
});

// ------------------------------------------------------------
// getStaffDirectory — the listing behind the Admin & Staff screen.
// Merges the email-keyed assignments with the users collection so
// pending invitees (no account yet) and staff created the older way
// both appear in one list.
// ------------------------------------------------------------
export interface StaffDirectoryEntry {
  email: string;
  name?: string;
  phone?: string;
  role: AdminRole;
  status: StaffStatus;
  pending: boolean;
  uid?: string;
  isMasterAdmin: boolean;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

export const getStaffDirectory = onCall(async (request) => {
  const { uid: callerUid, role: callerRole } = requireStaff(request);
  if (callerRole === "COLLECTION_AGENT") {
    throw new HttpsError("permission-denied", "Collection agents don't manage staff.");
  }

  // Same hierarchy scoping as getTeamMembers: a SUPER_ADMIN sees every
  // staff record, everyone else only their own subtree.
  let inviteQuery: FirebaseFirestore.Query = db.collection(STAFF_INVITES);
  let userQuery: FirebaseFirestore.Query = db.collection(USERS);
  if (callerRole === "ADMIN") {
    inviteQuery = inviteQuery.where("adminId", "==", callerUid);
    userQuery = userQuery.where("adminId", "==", callerUid);
  } else if (callerRole === "SUB_ADMIN") {
    inviteQuery = inviteQuery.where("subAdminId", "==", callerUid);
    userQuery = userQuery.where("subAdminId", "==", callerUid);
  } else {
    // SUPER_ADMIN — every staff account, however it was provisioned.
    userQuery = userQuery.where("role", "in", ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"]);
  }

  const [inviteSnap, userSnap] = await Promise.all([inviteQuery.limit(500).get(), userQuery.limit(500).get()]);
  const masterEmail = getMasterAdminEmail();
  const byEmail = new Map<string, StaffDirectoryEntry>();

  for (const doc of userSnap.docs) {
    const d = doc.data();
    const email = normalizeEmail(d.email);
    if (!email || !isAdminRole(d.role)) continue;
    byEmail.set(email, {
      email,
      name: d.name,
      phone: d.phone,
      role: d.role as AdminRole,
      status: d.status === "inactive" ? "revoked" : "active",
      pending: false,
      uid: doc.id,
      isMasterAdmin: isMasterAdminEmail(email, masterEmail),
      superAdminId: d.superAdminId,
      adminId: d.adminId,
      subAdminId: d.subAdminId,
    });
  }

  // The invite record wins on conflict — it is the authoritative
  // assignment, and the users document is only its mirror.
  for (const doc of inviteSnap.docs) {
    const d = doc.data();
    const email = normalizeEmail(d.email) || doc.id;
    if (!isAdminRole(d.role)) continue;
    byEmail.set(email, {
      email,
      name: d.name ?? byEmail.get(email)?.name,
      phone: d.phone ?? byEmail.get(email)?.phone,
      role: d.role as AdminRole,
      status: d.status === "revoked" ? "revoked" : "active",
      pending: !d.uid,
      uid: d.uid,
      isMasterAdmin: isMasterAdminEmail(email, masterEmail),
      superAdminId: d.superAdminId || undefined,
      adminId: d.adminId || undefined,
      subAdminId: d.subAdminId || undefined,
    });
  }

  return { staff: Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email)) };
});

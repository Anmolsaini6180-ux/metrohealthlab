import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { lookupUidByEmail } from "./roleService";
import type { AdminRole, StaffContext, StaffDirectoryEntry, TeamMember, TeamMemberStatus } from "@/types/team";
import { canAssignRole, ownershipChainFor } from "@/utils/roleAccess";

// ============================================================
// Staff management on the Spark plan — plain Firestore reads and
// writes, every one of them gated by firestore.rules.
//
// There is no Cloud Function anywhere in this file, and there is also
// no trust placed in the `caller` argument: it exists to shape the
// query (Firestore needs the equality filter the rules expect) and to
// decide what the UI offers. The rules independently re-read the
// caller's OWN users/{uid} document and recompute the same decision,
// so a caller who lies about their role simply gets a denied write.
//
// What the rules enforce on every write below:
//   * you may only assign a role strictly beneath your own;
//   * the ownership chain must be exactly your own position in the
//     tree — you cannot graft someone under a different manager;
//   * you may not touch your own record, or the master's;
//   * you must already have authority over an existing staff record
//     before you can re-role or revoke it;
//   * nothing but role/status/chain/updatedAt/updatedBy may move.
// ============================================================

const USERS = "users";
const DIRECTORY_LIMIT = 500;

const STAFF_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

export class StaffOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffOperationError";
  }
}

function toTeamMember(snap: QueryDocumentSnapshot): TeamMember {
  const d = snap.data();
  return {
    uid: snap.id,
    name: (d.name as string) ?? "",
    email: (d.email as string) ?? "",
    phone: d.phone as string | undefined,
    role: d.role as AdminRole,
    status: ((d.status as TeamMemberStatus) ?? "active") as TeamMemberStatus,
    superAdminId: d.superAdminId as string | undefined,
    adminId: d.adminId as string | undefined,
    subAdminId: d.subAdminId as string | undefined,
    createdBy: d.createdBy as string | undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// The hierarchy-scoped staff query. Each branch matches exactly one
// branch of the `allow list` rule on users/{userId}: a SUPER_ADMIN
// must filter on `role` (so this can never become a bulk customer
// dump), an ADMIN/SUB_ADMIN on their own subtree. Any other shape of
// query is refused by Firestore, not merely discouraged here.
async function fetchScopedStaff(caller: StaffContext): Promise<TeamMember[]> {
  const users = collection(getDb(), USERS);

  if (caller.role === "SUPER_ADMIN") {
    const snap = await getDocs(query(users, where("role", "in", STAFF_ROLES), limit(DIRECTORY_LIMIT)));
    return snap.docs.map(toTeamMember);
  }
  if (caller.role === "ADMIN") {
    const snap = await getDocs(query(users, where("adminId", "==", caller.uid), limit(DIRECTORY_LIMIT)));
    return snap.docs.map(toTeamMember);
  }
  if (caller.role === "SUB_ADMIN") {
    const snap = await getDocs(query(users, where("subAdminId", "==", caller.uid), limit(DIRECTORY_LIMIT)));
    return snap.docs.map(toTeamMember);
  }
  // COLLECTION_AGENT (or no role at all) manages nobody.
  return [];
}

// Admin -> Settings -> Admin & Staff. Returns only what this caller is
// allowed to see; the same scoping is enforced by the rules, so a
// tampered caller object yields a permission error, not extra rows.
export async function getStaffDirectory(caller: StaffContext): Promise<StaffDirectoryEntry[]> {
  const members = await fetchScopedStaff(caller);
  return members
    .filter((m) => STAFF_ROLES.includes(m.role))
    .map((m) => ({
      uid: m.uid,
      email: m.email,
      name: m.name || undefined,
      phone: m.phone,
      role: m.role,
      status: m.status,
      isMasterAdmin: !!caller.masterUid && m.uid === caller.masterUid,
      superAdminId: m.superAdminId,
      adminId: m.adminId,
      subAdminId: m.subAdminId,
    }))
    .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
}

// The reporting-hierarchy view. Same scoped query, optionally narrowed
// to one role (filtered client-side so no composite index is needed).
export async function getTeamMembers(caller: StaffContext, role?: AdminRole): Promise<TeamMember[]> {
  const members = await fetchScopedStaff(caller);
  const staff = members.filter((m) => STAFF_ROLES.includes(m.role) && m.uid !== caller.uid);
  return role ? staff.filter((m) => m.role === role) : staff;
}

// Grants or changes a role.
//
// `preserveChain` is the difference between the two cases the rules
// distinguish: a FRESH assignment must carry the caller's own position
// in the tree (you can only ever attach somebody underneath yourself),
// while acting on an EXISTING staff member leaves the chain untouched
// so that, say, a super admin revoking an agent three levels down does
// not silently re-parent them.
export async function setStaffRole(
  caller: StaffContext,
  targetUid: string,
  role: AdminRole,
  options: { status?: Exclude<TeamMemberStatus, "inactive">; preserveChain?: boolean } = {}
): Promise<void> {
  const { status = "active", preserveChain = false } = options;

  if (!canAssignRole(caller.role, role)) {
    throw new StaffOperationError(`A ${caller.role ?? "non-staff account"} cannot assign the role ${role}.`);
  }
  if (targetUid === caller.uid) {
    throw new StaffOperationError("You cannot change your own role or access.");
  }
  if (caller.masterUid && targetUid === caller.masterUid) {
    throw new StaffOperationError("The master admin account is configured outside the app and cannot be edited here.");
  }

  await updateDoc(doc(getDb(), USERS, targetUid), {
    role,
    status,
    ...(preserveChain ? {} : ownershipChainFor(caller)),
    updatedBy: caller.uid,
    updatedAt: serverTimestamp(),
  });
}

// Grants a role by email address. Looks the person up in the
// email -> uid directory first, so the screen can say "they have not
// signed in yet" rather than writing anything.
//
// The Spark model deliberately has no "invite an email that has never
// signed in": a role is always attached to a real Firebase Auth uid.
// Anything else would mean a privileged record keyed by an address
// that a security rule cannot verify anybody owns.
export async function grantStaffRoleByEmail(
  caller: StaffContext,
  email: string,
  role: AdminRole
): Promise<{ uid: string }> {
  const uid = await lookupUidByEmail(email);
  if (!uid) {
    throw new StaffOperationError(
      "No account has signed in with that email address yet. Ask them to sign in once (Google, or an email/password account with a verified address), then grant the role."
    );
  }
  await setStaffRole(caller, uid, role);
  return { uid };
}

// Changes an existing staff member's role from the directory.
export async function changeStaffRole(
  caller: StaffContext,
  target: StaffDirectoryEntry,
  role: AdminRole
): Promise<void> {
  await setStaffRole(caller, target.uid, role, { preserveChain: true });
}

// Removes admin access. The record is kept (marked revoked) so the row
// stays visible and access can be restored later. Because `status` is
// what every rule checks, the very next request from that account is
// already unprivileged — nothing has to expire first.
export async function revokeStaffMember(caller: StaffContext, target: StaffDirectoryEntry): Promise<void> {
  await setStaffRole(caller, target.uid, target.role, { status: "revoked", preserveChain: true });
}

export async function restoreStaffMember(caller: StaffContext, target: StaffDirectoryEntry): Promise<void> {
  await setStaffRole(caller, target.uid, target.role, { status: "active", preserveChain: true });
}

// The reporting-hierarchy view's Activate/Deactivate control. On Spark
// this changes the Firestore authorization record only — it cannot
// disable the Firebase Auth account itself (that needs the Admin SDK).
// Since every rule reads `status` live, a deactivated member can still
// sign in and simply has no staff access at all.
export async function updateTeamMemberStatus(
  caller: StaffContext,
  member: TeamMember,
  status: Exclude<TeamMemberStatus, "inactive">
): Promise<void> {
  await setStaffRole(caller, member.uid, member.role, { status, preserveChain: true });
}

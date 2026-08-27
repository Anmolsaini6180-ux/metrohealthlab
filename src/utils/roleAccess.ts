import { CREATABLE_ROLES, type AdminRole, type StaffContext, type TeamMemberStatus } from "@/types/team";

// Pure, UI-side helpers for reasoning about the caller's staff role.
// Every one of these is presentation logic ONLY — which menu item to
// show, which page to land on, which options to offer, and how to
// shape a Firestore query so it matches what the rules allow.
//
// The security boundary is elsewhere and unconditional:
// firestore.rules re-reads system/config and users/{uid} from
// Firestore on every single request and decides for itself. Deleting
// this file would change what the UI looks like and nothing about what
// a user is actually able to do.

export const ADMIN_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role);
}

// Mirrors assignedRole() in firestore.rules: a stored role only counts
// while the record is explicitly active, and a stored "SUPER_ADMIN" is
// never honoured — that role comes exclusively from the system/config
// bootstrap document.
export function roleFromStaffRecord(
  record: { role?: unknown; status?: unknown } | null | undefined
): AdminRole | null {
  if (!record) return null;
  if (record.status !== "active") return null;
  const role = record.role;
  return role === "ADMIN" || role === "SUB_ADMIN" || role === "COLLECTION_AGENT" ? role : null;
}

export function isActiveStatus(status: unknown): status is TeamMemberStatus {
  return status === "active";
}

// Turns the two trusted documents (system/config and users/{uid}) into
// the context the UI renders from. Deliberately pure so the exact
// precedence — master first, then an active assigned role, otherwise
// nothing — is unit-testable without Firebase.
//
// It mirrors role() in firestore.rules, including the part that makes a
// stored "SUPER_ADMIN" worthless for anyone but the bootstrapped uid.
export function buildStaffContext(
  uid: string,
  masterUid: string,
  record: { role?: unknown; status?: unknown; superAdminId?: string; adminId?: string; subAdminId?: string } | null
): StaffContext {
  const isMaster = !!uid && !!masterUid && uid === masterUid;
  return {
    uid,
    masterUid,
    isMaster,
    role: isMaster ? "SUPER_ADMIN" : roleFromStaffRecord(record),
    status: isMaster ? "active" : ((record?.status as TeamMemberStatus | undefined) ?? null),
    superAdminId: record?.superAdminId,
    adminId: record?.adminId,
    subAdminId: record?.subAdminId,
  };
}

// Where a staff member's "Admin Dashboard" link should take them.
// Collection agents get their own workspace (their assignments) rather
// than the team-wide admin dashboard.
export function adminHomePathForRole(role: unknown): string | null {
  if (!isAdminRole(role)) return null;
  return role === "COLLECTION_AGENT" ? "/agent" : "/admin";
}

export function adminMenuLabelForRole(role: unknown): string | null {
  if (!isAdminRole(role)) return null;
  return role === "COLLECTION_AGENT" ? "My Collections" : "Admin Dashboard";
}

// Mirrors canAssign() in firestore.rules. Used to decide which roles
// the staff form offers; the identical check runs again inside the
// security rules, which is the one that counts.
export function canAssignRole(callerRole: unknown, targetRole: unknown): boolean {
  if (!isAdminRole(callerRole) || !isAdminRole(targetRole)) return false;
  return CREATABLE_ROLES[callerRole].includes(targetRole);
}

export function assignableRoles(callerRole: unknown): AdminRole[] {
  return isAdminRole(callerRole) ? [...CREATABLE_ROLES[callerRole]] : [];
}

export function canManageStaff(callerRole: unknown): boolean {
  return callerRole === "SUPER_ADMIN" || callerRole === "ADMIN" || callerRole === "SUB_ADMIN";
}

// Mirrors expectedSuperAdminId/expectedAdminId/expectedSubAdminId in
// firestore.rules. The chain a staff record gets is fixed by WHO is
// writing it, never by anything typed into the form — the rules
// recompute exactly this from the caller's own stored record and
// reject the write if the values differ, so this helper exists only so
// the client sends something that will be accepted.
export interface OwnershipChain {
  superAdminId: string;
  adminId: string;
  subAdminId: string;
}

export function ownershipChainFor(caller: StaffContext): OwnershipChain {
  return {
    superAdminId: caller.role === "SUPER_ADMIN" ? caller.uid : caller.superAdminId ?? "",
    adminId: caller.role === "ADMIN" ? caller.uid : caller.adminId ?? "",
    subAdminId: caller.role === "SUB_ADMIN" ? caller.uid : caller.subAdminId ?? "",
  };
}

// Mirrors hasAuthorityOver() in firestore.rules: a SUPER_ADMIN over
// every staff record, everyone else only over records whose
// denormalized chain points back at them.
export function hasAuthorityOver(
  caller: StaffContext,
  target: { role?: unknown; adminId?: string; subAdminId?: string }
): boolean {
  if (caller.role === "SUPER_ADMIN") return true;
  if (caller.role === "ADMIN") return !!target.adminId && target.adminId === caller.uid;
  if (caller.role === "SUB_ADMIN") return !!target.subAdminId && target.subAdminId === caller.uid;
  return false;
}

// Can this caller change this existing staff row at all? Combines the
// three rules-side conditions: never yourself, never the master, and
// only within your authority and your assignable range.
export function canEditStaffMember(
  caller: StaffContext,
  target: { uid: string; role: AdminRole; adminId?: string; subAdminId?: string }
): boolean {
  if (!canManageStaff(caller.role)) return false;
  if (target.uid === caller.uid) return false;
  if (target.uid === caller.masterUid) return false;
  if (!hasAuthorityOver(caller, target)) return false;
  return caller.role === "SUPER_ADMIN" || canAssignRole(caller.role, target.role);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUB_ADMIN: "Sub Admin",
  COLLECTION_AGENT: "Collection Agent",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Full access, including staff management and settings.",
  ADMIN: "Catalog, bookings, customers, marketing and reports.",
  SUB_ADMIN: "Operational access to their own assigned bookings and leads.",
  COLLECTION_AGENT: "Their own sample collection assignments only.",
};

import { CREATABLE_ROLES, type AdminRole } from "@/types/team";

// Pure, UI-side helpers for reasoning about the role in the caller's
// ID token. Every one of these is presentation logic ONLY — which menu
// item to show, which page to land on, which options to offer. The
// security boundary is elsewhere and unconditional: Firebase Auth
// custom claims, checked by firestore.rules and by every admin Cloud
// Function. Deleting this file would change what the UI looks like and
// nothing about what a user is actually able to do.

export const ADMIN_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role);
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

// Mirrors canAssignRole in functions/src/roleClaims.ts. Used to decide
// which roles the staff form offers; the identical check runs again
// server-side in upsertStaffMember, which is the one that counts.
export function canAssignRole(callerRole: unknown, targetRole: unknown): boolean {
  if (!isAdminRole(callerRole) || !isAdminRole(targetRole)) return false;
  return CREATABLE_ROLES[callerRole].includes(targetRole);
}

export function assignableRoles(callerRole: unknown): AdminRole[] {
  return isAdminRole(callerRole) ? [...CREATABLE_ROLES[callerRole]] : [];
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

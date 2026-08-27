export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUB_ADMIN" | "COLLECTION_AGENT";

// The only two values the Spark rules accept for a staff record.
// "inactive" is a legacy value from the Cloud Function era; anything
// that is not exactly "active" confers no access at all, so old
// documents stay safe without a migration.
export type StaffStatus = "active" | "revoked";
export type TeamMemberStatus = StaffStatus | "inactive";

// Mirrors the users/{uid} document for staff accounts. The ownership
// chain is denormalized — every level stores every ancestor's uid, not
// just its direct parent — so hierarchy-scoped Firestore rules and
// queries never need a recursive lookup.
//
// This document IS the authorization record: firestore.rules reads it
// live on every request to decide what the caller may do. It is
// writable only by a higher-ranked staff member, and only through the
// narrowly-scoped rule in firestore.rules (see isStaffRoleWrite).
export interface TeamMember {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: AdminRole;
  status: TeamMemberStatus;

  // Ownership chain — present depending on role:
  //   ADMIN:             superAdminId
  //   SUB_ADMIN:         superAdminId, adminId
  //   COLLECTION_AGENT:  superAdminId, adminId, subAdminId
  // Unused levels are stored as "" rather than omitted, because the
  // security rules compare all three fields on every staff write.
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;

  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: string;
}

export const ROLE_HIERARCHY: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

// What each role is allowed to assign beneath itself. This MUST stay
// equivalent to canAssign() in firestore.rules — that copy is the one
// that actually enforces anything; this one only decides which options
// the dropdown offers. Note that nobody can assign SUPER_ADMIN: that
// role belongs solely to the uid in the system/config bootstrap
// document, which no client can write.
export const CREATABLE_ROLES: Record<AdminRole, AdminRole[]> = {
  SUPER_ADMIN: ["ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"],
  ADMIN: ["SUB_ADMIN", "COLLECTION_AGENT"],
  SUB_ADMIN: ["COLLECTION_AGENT"],
  COLLECTION_AGENT: [],
};

// Who the current signed-in account is, as far as authorization is
// concerned. Resolved once per sign-in from Firestore (system/config +
// users/{uid}) by AuthProvider, and passed explicitly into the staff
// services so no module keeps hidden global auth state.
//
// This object is PRESENTATION AND QUERY SHAPING ONLY. Every value in
// it is re-derived from Firestore by the security rules on each
// request; a tampered copy just produces a request that gets denied.
export interface StaffContext {
  uid: string;
  role: AdminRole | null;
  status: TeamMemberStatus | null;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
  // True when this account is the uid stored in system/config — the
  // single trusted root authority.
  isMaster: boolean;
  // The bootstrapped master uid, so the staff screen can render that
  // one row read-only. Empty when the project has not been
  // bootstrapped yet.
  masterUid: string;
}

// One row of Admin -> Settings -> Admin & Staff. Built directly from
// users/{uid} documents the caller is allowed to read.
export interface StaffDirectoryEntry {
  uid: string;
  email: string;
  name?: string;
  phone?: string;
  role: AdminRole;
  status: TeamMemberStatus;
  // The bootstrap/master account. Shown read-only — its authority
  // comes from system/config, which no client can write.
  isMasterAdmin: boolean;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Coarse, role-based capability set. Every capability here is also
// enforced independently in firestore.rules, so this map only controls
// what the UI shows; it is never the actual security boundary.
export const CAN_MANAGE_CATALOG: AdminRole[] = ["SUPER_ADMIN", "ADMIN"];
export const CAN_MANAGE_TEAM: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];
export const CAN_VIEW_ANALYTICS: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];

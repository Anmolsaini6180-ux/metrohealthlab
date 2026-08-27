export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUB_ADMIN" | "COLLECTION_AGENT";

export type TeamMemberStatus = "active" | "inactive";

// Mirrors the users/{uid} document for staff accounts, and the custom
// claims set on their Firebase Auth token (role + the ownership chain
// below). The chain is denormalized — every level stores every
// ancestor's uid, not just its direct parent — so hierarchy-scoped
// Firestore rules and queries never need a recursive lookup.
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
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;

  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export const ROLE_HIERARCHY: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

// What each role is allowed to assign beneath itself. This MUST stay
// byte-for-byte equivalent to CREATABLE_ROLES in
// functions/src/roleClaims.ts — that copy is the one that actually
// enforces anything; this one only decides which options the dropdown
// offers. Note SUPER_ADMIN cannot assign SUPER_ADMIN: that role exists
// solely for whoever signs in as MASTER_ADMIN_EMAIL, resolved
// server-side, so it can never be handed out from inside the app.
export const CREATABLE_ROLES: Record<AdminRole, AdminRole[]> = {
  SUPER_ADMIN: ["ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"],
  ADMIN: ["SUB_ADMIN", "COLLECTION_AGENT"],
  SUB_ADMIN: ["COLLECTION_AGENT"],
  COLLECTION_AGENT: [],
};

export type StaffStatus = "active" | "revoked";

// One row of Admin -> Settings -> Admin & Staff. Returned by the
// getStaffDirectory Cloud Function, which merges the email-keyed
// assignments with the staff accounts in the users collection so that
// people who haven't signed in yet ("pending") still appear.
export interface StaffDirectoryEntry {
  email: string;
  name?: string;
  phone?: string;
  role: AdminRole;
  status: StaffStatus;
  // True until the invited person has signed in at least once and had
  // the role applied to a real Firebase Auth account.
  pending: boolean;
  uid?: string;
  // The MASTER_ADMIN_EMAIL account. Shown read-only — its access comes
  // from server configuration, not from any record the app can edit.
  isMasterAdmin: boolean;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Coarse, role-based capability set. Deliberately simpler than a fully
// dynamic per-user permission editor (spec section 41) — every
// capability here is also enforced independently in Firestore rules
// and/or Cloud Functions, so this map only controls what the UI shows;
// it is never the actual security boundary.
export const CAN_MANAGE_CATALOG: AdminRole[] = ["SUPER_ADMIN", "ADMIN"];
export const CAN_MANAGE_TEAM: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];
export const CAN_VIEW_ANALYTICS: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];

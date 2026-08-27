import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUB_ADMIN" | "COLLECTION_AGENT";

// Same set firestore.rules' canManageCatalog() uses. Kept in one place
// so the rules and the Cloud Functions can't drift apart.
export const CATALOG_MANAGER_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN"];

export function isCatalogManagerRole(role: unknown): role is AdminRole {
  return typeof role === "string" && CATALOG_MANAGER_ROLES.includes(role as AdminRole);
}

export const CREATABLE_ROLES: Record<AdminRole, AdminRole[]> = {
  SUPER_ADMIN: ["ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"],
  ADMIN: ["SUB_ADMIN", "COLLECTION_AGENT"],
  SUB_ADMIN: ["COLLECTION_AGENT"],
  COLLECTION_AGENT: [],
};

export interface CallerClaims {
  role?: AdminRole;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Custom claims are the only trustworthy source of a caller's role/chain
// — they're embedded in the signed ID token by the Admin SDK
// (setCustomUserClaims), so nothing the client sends in the request
// body is ever used for authorization here.
export function getCallerClaims<T>(request: CallableRequest<T>): CallerClaims {
  const token = request.auth?.token as Record<string, unknown> | undefined;
  return {
    role: token?.role as AdminRole | undefined,
    superAdminId: token?.superAdminId as string | undefined,
    adminId: token?.adminId as string | undefined,
    subAdminId: token?.subAdminId as string | undefined,
  };
}

// Authorization guard for every media/report management endpoint.
// Reads the role from the signed ID token's custom claims only — never
// from the request body and never from a Firestore document — so a
// client cannot promote itself by writing anywhere.
export function requireCatalogManager<T>(request: CallableRequest<T>): { uid: string; role: AdminRole } {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
  const { role } = getCallerClaims(request);
  if (!isCatalogManagerRole(role)) {
    throw new HttpsError("permission-denied", "You don't have permission to do this.");
  }
  return { uid, role: role as AdminRole };
}

// ---------- Master admin + staff role assignment ----------

export const ALL_ADMIN_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN", "COLLECTION_AGENT"];

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === "string" && ALL_ADMIN_ROLES.includes(role as AdminRole);
}

// Emails are compared case-insensitively and whitespace-trimmed
// everywhere (claim grants, invite lookups, document ids) so
// "Owner@Gmail.com " and "owner@gmail.com" can never be treated as two
// different people — which would otherwise be a way to sidestep a
// revocation by re-inviting a differently-cased spelling.
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// The one rule that stops privilege escalation through the staff
// management endpoints: you may only ever assign a role that sits
// strictly BELOW your own in CREATABLE_ROLES. Notably nobody — not
// even a SUPER_ADMIN — can mint another SUPER_ADMIN through this path;
// that title belongs solely to MASTER_ADMIN_EMAIL, resolved
// server-side at sign-in.
export function canAssignRole(callerRole: unknown, targetRole: unknown): boolean {
  if (!isAdminRole(callerRole) || !isAdminRole(targetRole)) return false;
  return CREATABLE_ROLES[callerRole].includes(targetRole);
}

// Denormalized ownership chain: every level carries every ancestor's
// uid (not just its direct parent), so hierarchy-scoped rules and
// queries never need a recursive lookup. Pure so it can be tested
// without Firestore.
export function buildOwnershipChain(
  callerUid: string,
  caller: CallerClaims,
  targetRole: AdminRole
): { superAdminId?: string; adminId?: string; subAdminId?: string } {
  const chain: { superAdminId?: string; adminId?: string; subAdminId?: string } = {};
  if (targetRole === "ADMIN") {
    chain.superAdminId = callerUid;
  } else if (targetRole === "SUB_ADMIN") {
    chain.superAdminId = caller.role === "SUPER_ADMIN" ? callerUid : caller.superAdminId ?? "";
    chain.adminId = caller.role === "ADMIN" ? callerUid : caller.adminId ?? "";
  } else if (targetRole === "COLLECTION_AGENT") {
    chain.superAdminId = caller.role === "SUPER_ADMIN" ? callerUid : caller.superAdminId ?? "";
    chain.adminId = caller.role === "ADMIN" ? callerUid : caller.adminId ?? "";
    chain.subAdminId = caller.role === "SUB_ADMIN" ? callerUid : caller.subAdminId ?? "";
  }
  return chain;
}

// Guard for the staff-management endpoints: any staff role may call
// them, but canAssignRole() still decides what they can actually do.
export function requireStaff<T>(request: CallableRequest<T>): { uid: string; role: AdminRole; claims: CallerClaims } {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
  const claims = getCallerClaims(request);
  if (!isAdminRole(claims.role)) {
    throw new HttpsError("permission-denied", "Not an authorized staff account.");
  }
  return { uid, role: claims.role, claims };
}

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUB_ADMIN" | "COLLECTION_AGENT";

// Same set firestore.rules' canManageCatalog() uses. Kept in one place
// so the rules and the Cloud Functions can't drift apart.
export const CATALOG_MANAGER_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN"];

export function isCatalogManagerRole(role: unknown): role is AdminRole {
  return typeof role === "string" && CATALOG_MANAGER_ROLES.includes(role as AdminRole);
}

export interface CallerClaims {
  role?: AdminRole;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// LEGACY (Blaze-only). Custom claims can only be minted by the Admin
// SDK, which needs deployed Cloud Functions — impossible on the Spark
// plan this project runs on. Nothing sets these claims any more, so
// every guard below denies every caller. Authorization now lives in
// firestore.rules, which reads system/config and users/{uid} directly.
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

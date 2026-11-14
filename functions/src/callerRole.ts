import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import type { AdminRole } from "./roleClaims";

// Server-side authorization, derived from the SAME two documents
// firestore.rules reads — system/config.masterAdminUid and
// users/{uid}. It replaces roleClaims.getCallerClaims(), which read
// Firebase Auth custom claims that nothing has minted since this
// project moved off Cloud Functions; every guard built on it therefore
// denied every caller.
//
// Keeping the derivation identical to the rules is the point: a
// function and a rule disagreeing about who is an admin is exactly the
// class of bug that lets a request through one door and not the other.

export interface RoleDocuments {
  /** system/config.masterAdminUid, or "" when unbootstrapped. */
  masterAdminUid: string;
  /** The caller's users/{uid} document, or null when absent. */
  userDoc: { role?: unknown; status?: unknown } | null;
}

/**
 * The pure half: given the two documents, what role does this uid have?
 *
 * SUPER_ADMIN is deliberately NOT accepted from a user document — it is
 * derived exclusively from system/config, so a hand-written or legacy
 * users doc claiming role:"SUPER_ADMIN" confers nothing. A role also
 * only counts while the record is explicitly active, so revoking a
 * staff member takes effect on their very next request.
 */
export function deriveRole(uid: string, docs: RoleDocuments): AdminRole | null {
  if (docs.masterAdminUid !== "" && uid === docs.masterAdminUid) return "SUPER_ADMIN";

  const doc = docs.userDoc;
  if (!doc) return null;
  if (doc.status !== "active") return null;

  const role = doc.role;
  if (role === "ADMIN" || role === "SUB_ADMIN" || role === "COLLECTION_AGENT") return role;
  return null;
}

export function canManageCatalogRole(role: AdminRole | null): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/** Staff who may act on bookings operationally. */
export function canHandleBookingsRole(role: AdminRole | null): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SUB_ADMIN";
}

/** Reads the two authorization documents for a uid. */
export async function loadRoleDocuments(uid: string): Promise<RoleDocuments> {
  const [configSnap, userSnap] = await Promise.all([
    db.collection("system").doc("config").get(),
    db.collection("users").doc(uid).get(),
  ]);

  const masterAdminUid = configSnap.exists ? ((configSnap.data()?.masterAdminUid as string) ?? "") : "";
  return {
    masterAdminUid: typeof masterAdminUid === "string" ? masterAdminUid : "",
    userDoc: userSnap.exists ? (userSnap.data() as { role?: unknown; status?: unknown }) : null,
  };
}

export async function resolveCallerRole(uid: string): Promise<AdminRole | null> {
  return deriveRole(uid, await loadRoleDocuments(uid));
}

/** Requires a signed-in caller; returns their uid. */
export function requireUid(auth: { uid?: string } | undefined): string {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
  return uid;
}

/** Requires a signed-in caller who may manage the catalogue. */
export async function requireCatalogManagerUid(auth: { uid?: string } | undefined): Promise<{ uid: string; role: AdminRole }> {
  const uid = requireUid(auth);
  const role = await resolveCallerRole(uid);
  if (!canManageCatalogRole(role)) {
    throw new HttpsError("permission-denied", "You don't have permission to do this.");
  }
  return { uid, role: role as AdminRole };
}

/** Requires a signed-in caller who may act on bookings. */
export async function requireBookingStaff(auth: { uid?: string } | undefined): Promise<{ uid: string; role: AdminRole }> {
  const uid = requireUid(auth);
  const role = await resolveCallerRole(uid);
  if (!canHandleBookingsRole(role)) {
    throw new HttpsError("permission-denied", "You don't have permission to do this.");
  }
  return { uid, role: role as AdminRole };
}

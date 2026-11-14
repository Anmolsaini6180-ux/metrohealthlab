// Pure planning logic for the Firebase Auth -> Supabase Auth identity
// migration. Nothing here makes a network call or touches a database —
// every function is a plain transform over already-fetched data, which
// is what makes it unit-testable without live credentials.
//
// The one rule everything else follows: a Firebase user is matched to
// a Supabase identity by firebase_uid, NEVER by email. Email addresses
// can be reused, mistyped, or shared; firebase_uid cannot.

/**
 * Mirrors assignedRole() in firestore.rules and roleFromStaffRecord()
 * in src/utils/roleAccess.ts EXACTLY: a role only counts while the
 * record is explicitly "active", and a stored "SUPER_ADMIN" is never
 * honoured from a document — that authority comes exclusively from the
 * bootstrap config (system/config.masterAdminUid in Firestore,
 * app_config.master_admin_uid in Supabase). A doc claiming
 * role:"SUPER_ADMIN" for a non-master uid must resolve to no role at
 * all, the same as if the field were absent.
 */
export function assignedRole(doc) {
  if (!doc || doc.status !== "active") return null;
  const role = doc.role;
  return role === "ADMIN" || role === "SUB_ADMIN" || role === "COLLECTION_AGENT" ? role : null;
}

/**
 * Builds the per-account migration plan. Every entry describes what
 * WOULD happen; nothing here executes it.
 *
 * @param authUsers      Firebase Auth accounts (from accounts:batchGet)
 * @param firestoreDocs  Map<firebase_uid, users/{uid} doc content>
 * @param masterUid      system/config.masterAdminUid
 * @param existingProfiles Set<firebase_uid> already present in public.profiles
 */
export function buildMigrationPlan({ authUsers, firestoreDocs, masterUid, existingProfiles }) {
  return authUsers.map((u) => {
    const uid = u.localId;
    const doc = firestoreDocs.get(uid) ?? null;
    const alreadyMigrated = existingProfiles.has(uid);
    const isMaster = !!masterUid && uid === masterUid;
    // Precedence matches buildStaffContext() in roleAccess.ts exactly:
    // master first, otherwise an active assigned role, otherwise none.
    const role = isMaster ? "SUPER_ADMIN" : assignedRole(doc);

    let action;
    if (alreadyMigrated) {
      action = "skip-already-migrated";
    } else if (isMaster) {
      action = "create-and-set-master-config";
    } else if (role) {
      action = "create-and-assign-staff-role";
    } else {
      action = "create-customer-profile";
    }

    return {
      firebaseUid: uid,
      source: doc ? "firestore_profile" : "auth_only",
      isMaster,
      role,
      alreadyMigrated,
      action,
      hasEmail: !!u.email,
      hasPhone: !!u.phoneNumber,
      providers: (u.providerUserInfo ?? []).map((p) => p.providerId),
    };
  });
}

/**
 * Resolves a staff record's ownership chain (superAdminId/adminId/
 * subAdminId — each itself a Firebase UID) into the NEW Supabase UUIDs,
 * via the same firebase_uid -> profiles.id map used everywhere else.
 * Mirrors ownershipChainFor() in roleAccess.ts, but reads the chain
 * that was already stored rather than deriving it from "whoever is
 * writing" — Phase D populates from a trusted export, not a live
 * write, so the caller's own role is not relevant here.
 *
 * Returns null for a field that cannot yet be resolved (its owner
 * has not been migrated), so the caller can defer instead of writing
 * a wrong/blank uuid.
 */
export function resolveOwnershipChain(doc, uidToProfileId) {
  const resolve = (firebaseUid) => (firebaseUid ? uidToProfileId.get(firebaseUid) ?? undefined : null);
  return {
    superAdminId: resolve(doc?.superAdminId),
    adminId: resolve(doc?.adminId),
    subAdminId: resolve(doc?.subAdminId),
  };
}

/**
 * Whether a staff_roles insert built from resolveOwnershipChain() is
 * safe to run — every referenced ancestor must already be resolved.
 * `undefined` means "referenced but not yet migrated"; `null` means
 * "not applicable" and is fine.
 */
export function chainIsResolved(chain) {
  return chain.superAdminId !== undefined && chain.adminId !== undefined && chain.subAdminId !== undefined;
}

/**
 * The phone-auth bridge lookup: given a Firebase phone sign-in, find
 * the existing profile to attach to rather than minting a new one.
 * Checked in this order so a customer who first signed up with
 * Google/email and later verifies the same phone is recognised by
 * firebase_uid before ever falling back to matching by phone number —
 * phone numbers can be reassigned by a carrier; firebase_uid cannot.
 */
export function resolvePhoneBridgeTarget({ firebaseUid, phone, profilesByFirebaseUid, profilesByPhone }) {
  if (firebaseUid && profilesByFirebaseUid.has(firebaseUid)) {
    return { action: "attach-existing", profileId: profilesByFirebaseUid.get(firebaseUid), matchedBy: "firebase_uid" };
  }
  if (phone && profilesByPhone.has(phone)) {
    return { action: "attach-existing", profileId: profilesByPhone.get(phone), matchedBy: "phone" };
  }
  return { action: "create-new", profileId: null, matchedBy: null };
}

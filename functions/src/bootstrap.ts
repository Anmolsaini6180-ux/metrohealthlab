import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { writeAuditLogDirect } from "./audit";

// Solves the chicken-and-egg problem: createTeamMember requires the
// CALLER to already have a role, but nobody has one on a fresh
// project. This is the one function that can create the very first
// SUPER_ADMIN — after that, an existing SUPER_ADMIN creates any
// further ones (or anyone else) through the normal createTeamMember
// path, which is already fully hierarchy-guarded.
//
// Set up (one time, right after deploying):
//   firebase functions:secrets:set SUPER_ADMIN_BOOTSTRAP_SECRET
//   (pick a long random value and keep it private — treat it like a
//   password, not like the public Firebase web config)
//
// Then, signed in as any normal Firebase Auth account (sign up through
// the app like a customer, or create one directly in the Firebase
// Console), call this function once with that secret. It permanently
// refuses to run again the moment ANY user already has the SUPER_ADMIN
// role — so leaving this deployed after initial setup is safe.
const bootstrapSecret = defineSecret("SUPER_ADMIN_BOOTSTRAP_SECRET");

interface BootstrapSuperAdminInput {
  bootstrapSecret: string;
  name: string;
}

export const bootstrapSuperAdmin = onCall<BootstrapSuperAdminInput>(
  { secrets: [bootstrapSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in first (any account), then call this once.");
    }
    const input = request.data;
    if (!input?.bootstrapSecret || !input.name) {
      throw new HttpsError("invalid-argument", "bootstrapSecret and name are required.");
    }
    if (input.bootstrapSecret !== bootstrapSecret.value()) {
      throw new HttpsError("permission-denied", "Invalid bootstrap secret.");
    }

    const existing = await db.collection("users").where("role", "==", "SUPER_ADMIN").limit(1).get();
    if (!existing.empty) {
      throw new HttpsError(
        "failed-precondition",
        "A SUPER_ADMIN already exists. This bootstrap path is permanently disabled — use Team Management to add more staff."
      );
    }

    const uid = request.auth.uid;
    const auth = getAuth();
    await auth.setCustomUserClaims(uid, { role: "SUPER_ADMIN" });

    await db.collection("users").doc(uid).set(
      {
        uid,
        name: input.name,
        email: request.auth.token.email ?? null,
        role: "SUPER_ADMIN",
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditLogDirect({
      action: "team.super_admin_bootstrapped",
      actorType: "system",
      actorId: uid,
      targetType: "user",
      targetId: uid,
    });

    return { ok: true };
  }
);

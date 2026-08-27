import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { writeAuditLogDirect } from "./audit";

// The project owner's email — set once, permanently. Whenever this
// exact email signs in, this grants SUPER_ADMIN — no manual secret, no
// separate setup page. Entirely server-side via the Admin SDK; nothing
// about it is client-controllable.
const OWNER_EMAIL = "anmolsaini6180@gmail.com";

async function grantIfOwner(uid: string, email: string | null | undefined): Promise<boolean> {
  if (!email || email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) return false;

  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.exists && userDoc.data()?.role === "SUPER_ADMIN") return true; // already done

  await getAuth().setCustomUserClaims(uid, { role: "SUPER_ADMIN" });
  await db.collection("users").doc(uid).set(
    { role: "SUPER_ADMIN", status: "active", updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await writeAuditLogDirect({
    action: "team.owner_auto_granted_super_admin",
    actorType: "system",
    actorId: uid,
    targetType: "user",
    targetId: uid,
    metadata: { email },
  });
  return true;
}

// PRIMARY mechanism — called synchronously from the frontend login flow
// (see useAuth.tsx) right after sign-in, and awaited before the app
// considers auth "ready" and refreshes the ID token. This is what
// actually fixes the race condition: a Firestore trigger alone runs
// asynchronously server-side, and the client's very next token check
// (useAdminRole, which fires immediately on sign-in) can easily win
// that race and see no claim yet — a callable the client awaits can't
// have that problem, since the claim is guaranteed set before this
// function returns.
export const checkOwnerAutoGrant = onCall(async (request) => {
  if (!request.auth) return { granted: false };
  const granted = await grantIfOwner(request.auth.uid, request.auth.token.email as string | undefined);
  return { granted };
});

// Backup mechanism — in case a profile document ever gets created or
// touched through a path that doesn't go through the login flow above.
// Idempotent (checks role first), so having both is harmless.
export const grantOwnerSuperAdmin = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const data = after.data();
  await grantIfOwner(event.params.uid, data?.email as string | undefined);
});

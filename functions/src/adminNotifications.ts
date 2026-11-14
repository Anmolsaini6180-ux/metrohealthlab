import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { writeAuditLogDirect } from "./audit";
import { getCallerClaims } from "./roleClaims";
import { writeNotification } from "./notifications";

interface SendAdminNotificationInput {
  customerUid: string;
  type: "offer" | "system";
  title: string;
  message: string;
}

// The only way an admin-originated notification is ever created —
// direct client writes to notifications/ are denied entirely in
// firestore.rules, so this scope check is the actual enforcement, not
// a UI nicety. Deliberately restricted to "offer" (marketing) and
// "system" (general) — every other NotificationType (booking_received,
// payment_successful, collector_assigned, etc.) is written only by the
// automatic booking/payment Cloud Functions, since fabricating one of
// those manually would misrepresent something that didn't actually
// happen.
export const sendAdminNotification = onCall<SendAdminNotificationInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role || !["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"].includes(caller.role)) {
    throw new HttpsError("permission-denied", "Not authorized to send notifications.");
  }
  const callerUid = request.auth!.uid;
  const { customerUid, type, title, message } = request.data;
  if (!customerUid || !type || !title || !message) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }
  if (type !== "offer" && type !== "system") {
    throw new HttpsError("invalid-argument", "Admin-sent notifications must be type 'offer' or 'system'.");
  }

  if (caller.role !== "SUPER_ADMIN") {
    const assignField = caller.role === "ADMIN" ? "assignedAdminId" : "assignedSubAdminId";
    const scopeSnap = await db.collection("bookings").where("userId", "==", customerUid).where(assignField, "==", callerUid).limit(1).get();
    if (scopeSnap.empty) {
      throw new HttpsError("permission-denied", "This customer isn't in your team's scope.");
    }
  }

  await db.runTransaction(async (tx) => {
    writeNotification(tx, { userId: customerUid, type, title, message });
  });

  await writeAuditLogDirect({
    action: "notification.sent_by_admin",
    actorType: "staff",
    actorId: callerUid,
    targetType: "notification",
    targetId: customerUid,
    metadata: { type, title },
  });

  return { ok: true };
});

import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";

type NotificationType =
  | "booking_received"
  | "booking_confirmed"
  | "payment_successful"
  | "collector_assigned"
  | "on_the_way"
  | "sample_collected"
  | "report_ready"
  | "cancelled"
  | "refund"
  | "offer"
  | "system";

// Every notification the backend writes goes through here so the set of
// possible messages stays in one place — including the ones no caller
// uses yet (collector_assigned/on_the_way/sample_collected/report_ready
// /cancelled/refund), which future Admin-panel status-change functions
// will call with the same helper.
export function writeNotification(
  tx: Transaction,
  params: { userId: string; type: NotificationType; title: string; message: string }
) {
  tx.set(db.collection("notifications").doc(), {
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

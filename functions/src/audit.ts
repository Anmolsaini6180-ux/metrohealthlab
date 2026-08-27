import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";

// Server-side audit trail. Nothing reads this yet (no Admin UI), but
// every trust-sensitive mutation writes one so the future Admin panel
// has a real history to show rather than needing a backfill. Firestore
// rules already restrict auditLogs to staff-read / no client-write.
export function writeAuditLog(
  tx: Transaction,
  params: {
    action: string;
    actorType: "customer" | "staff" | "system" | "webhook";
    actorId?: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }
) {
  tx.set(db.collection("auditLogs").doc(), {
    ...params,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// Same shape, for call sites with no transaction in progress (e.g. a
// plain read like a report download) where strict atomicity with the
// triggering read isn't required.
export async function writeAuditLogDirect(params: {
  action: string;
  actorType: "customer" | "staff" | "system" | "webhook";
  actorId?: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.collection("auditLogs").add({
    ...params,
    createdAt: FieldValue.serverTimestamp(),
  });
}

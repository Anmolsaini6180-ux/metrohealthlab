import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";

// Server-side audit trail. Nothing reads this yet (no Admin UI), but
// every trust-sensitive mutation writes one so the future Admin panel
// has a real history to show rather than needing a backfill. Firestore
// rules already restrict auditLogs to staff-read / no client-write.
export interface AuditLogParams {
  action: string;
  actorType: "customer" | "staff" | "system" | "webhook";
  actorId?: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

// Spreading `params` directly used to be enough — until the catalog
// triggers started deriving actorId from a document's `updatedBy`
// field. A document written outside the admin panel (an older record,
// a console edit, a delete whose `before` had no updatedBy) yields
// `actorId: undefined`, and because the key is written explicitly it
// is *present* with an undefined value, which the Admin SDK rejects:
// "Cannot use \"undefined\" as a Firestore value". Omitting the key is
// also the honest representation — the author genuinely isn't known.
export function auditLogPayload(params: AuditLogParams) {
  const { action, actorType, actorId, targetType, targetId, metadata } = params;
  return {
    action,
    actorType,
    targetType,
    targetId,
    ...(actorId !== undefined ? { actorId } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

export function writeAuditLog(tx: Transaction, params: AuditLogParams) {
  tx.set(db.collection("auditLogs").doc(), auditLogPayload(params));
}

// Same shape, for call sites with no transaction in progress (e.g. a
// plain read like a report download) where strict atomicity with the
// triggering read isn't required.
export async function writeAuditLogDirect(params: AuditLogParams) {
  await db.collection("auditLogs").add(auditLogPayload(params));
}

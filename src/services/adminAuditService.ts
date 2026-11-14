// Supabase-backed. RLS (audit_logs_select_super) already restricts this
// table to SUPER_ADMIN, the same boundary the Firestore rule
// (`read: if isSuperAdmin()`) enforced. Unlike the Firestore version --
// whose rows only ever existed if a since-undeployed Cloud Function
// trigger had written them -- this trail is genuinely live: the
// record_cash_received / set_booking_status / assign_booking /
// set_staff_role / send_admin_notification RPCs (Phase A/H) each insert
// an audit_logs row in the same transaction as the change they make.
import { getSupabaseClient } from "@/supabase/client";

export interface AuditLogEntry {
  id: string;
  action: string;
  actorType: string;
  actorId?: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt: unknown;
}

export interface GetAuditLogsRequest {
  startDate: string;
  endDate: string;
  filterActorId?: string;
  filterAction?: string;
  filterTargetType?: string;
}

const AUDIT_READ_LIMIT = 300;

export async function getAuditLogs(payload: GetAuditLogsRequest): Promise<{ logs: AuditLogEntry[]; truncated: boolean }> {
  let query = getSupabaseClient()
    .from("audit_logs")
    .select("*")
    .gte("created_at", payload.startDate)
    .lte("created_at", payload.endDate)
    .order("created_at", { ascending: false })
    .limit(AUDIT_READ_LIMIT + 1);
  if (payload.filterActorId) query = query.eq("actor_id", payload.filterActorId);
  if (payload.filterAction) query = query.eq("action", payload.filterAction);
  if (payload.filterTargetType) query = query.eq("target_type", payload.filterTargetType);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const truncated = rows.length > AUDIT_READ_LIMIT;
  const scoped = truncated ? rows.slice(0, AUDIT_READ_LIMIT) : rows;

  return {
    logs: scoped.map((r) => ({
      id: r.id,
      action: r.action,
      actorType: r.actor_type,
      actorId: r.actor_id ?? undefined,
      targetType: r.target_type,
      targetId: r.target_id,
      metadata: (r.metadata as Record<string, unknown>) ?? undefined,
      createdAt: r.created_at,
    })),
    truncated,
  };
}

/** The audit trail is live now — real RPCs write it in the same
 * transaction as the change they make (see the header comment). */
export function auditTrailIsLive(): boolean {
  return true;
}

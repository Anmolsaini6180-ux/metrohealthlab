import { callFunction } from "@/firebase/functions";

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

// Hierarchy-scoped server-side — SUPER_ADMIN sees everything, ADMIN/
// SUB_ADMIN see only logs for actors within their own team. See
// functions/src/adminAuditLogs.ts.
export async function getAuditLogs(payload: GetAuditLogsRequest): Promise<{ logs: AuditLogEntry[]; truncated: boolean }> {
  return callFunction("getAuditLogs", payload);
}

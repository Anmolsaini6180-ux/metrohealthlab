// Supabase-backed. Aggregates real assigned bookings instead of
// calling the getTeamPerformance Cloud Function, which was never
// deployed. Scoped by bookings_select the same way every other admin
// booking read is: a SUPER_ADMIN sees everything, anyone else sees
// only what RLS already allows them to see.
import { getSupabaseClient } from "@/supabase/client";

export interface AgentPerformance {
  uid: string;
  name: string;
  assigned: number;
  completed: number;
  pending: number;
  cancelled: number;
  completionRate: number;
}

const PENDING_STATUSES = new Set(["payment_pending", "confirmed", "assigned", "on_the_way", "arrived", "sample_collected", "received_at_lab", "testing"]);
const CANCELLED_STATUSES = new Set(["cancelled", "refunded"]);

export async function getTeamPerformance(
  startDate: string,
  endDate: string
): Promise<{ performance: AgentPerformance[]; truncated: boolean }> {
  const client = getSupabaseClient();
  const LIMIT = 2000;
  const { data, error } = await client
    .from("bookings")
    .select("assigned_agent_id, booking_status")
    .gte("date", startDate)
    .lte("date", endDate)
    .not("assigned_agent_id", "is", null)
    .limit(LIMIT + 1);
  if (error) throw error;
  const rows = data ?? [];
  const truncated = rows.length > LIMIT;
  const scoped = truncated ? rows.slice(0, LIMIT) : rows;

  const byAgent = new Map<string, { assigned: number; completed: number; pending: number; cancelled: number }>();
  for (const r of scoped) {
    const agentId = r.assigned_agent_id as string;
    const entry = byAgent.get(agentId) ?? { assigned: 0, completed: 0, pending: 0, cancelled: 0 };
    entry.assigned += 1;
    if (r.booking_status === "completed") entry.completed += 1;
    else if (CANCELLED_STATUSES.has(r.booking_status as string)) entry.cancelled += 1;
    else if (PENDING_STATUSES.has(r.booking_status as string)) entry.pending += 1;
    byAgent.set(agentId, entry);
  }

  const agentIds = [...byAgent.keys()];
  const names = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: profileRows, error: profileError } = await client.from("profiles").select("id, name, email").in("id", agentIds);
    if (profileError) throw profileError;
    for (const p of profileRows ?? []) names.set(p.id, p.name || p.email || p.id);
  }

  const performance: AgentPerformance[] = agentIds.map((uid) => {
    const e = byAgent.get(uid)!;
    return {
      uid,
      name: names.get(uid) ?? uid,
      assigned: e.assigned,
      completed: e.completed,
      pending: e.pending,
      cancelled: e.cancelled,
      completionRate: e.assigned > 0 ? Math.round((e.completed / e.assigned) * 100) : 0,
    };
  });

  return { performance, truncated };
}

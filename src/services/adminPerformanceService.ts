// Supabase-backed. Aggregates real assigned bookings instead of
// calling the getTeamPerformance Cloud Function, which was never
// deployed. Scoped by bookings_select the same way every other admin
// booking read is: a SUPER_ADMIN sees everything, anyone else sees
// only what RLS already allows them to see.
import { getSupabaseClient } from "@/supabase/client";
import { rowToBooking } from "@/supabase/bookingMappers";
import type { Booking } from "@/types/booking";

export interface AgentPerformance {
  uid: string;
  name: string;
  assigned: number;
  completed: number;
  pending: number;
  cancelled: number;
  completionRate: number;
  /** Real cash collected (see cash_collections, written only by record_cash_received) for bookings dated in this range, credited to whoever actually recorded it — 0 rather than omitted when a staff member has collected nothing yet. */
  cashCollected: number;
}

const PENDING_STATUSES = new Set(["payment_pending", "confirmed", "assigned", "on_the_way", "arrived", "sample_collected", "received_at_lab", "testing"]);
const CANCELLED_STATUSES = new Set(["cancelled", "refunded"]);

export interface TeamPerformanceResult {
  performance: AgentPerformance[];
  truncated: boolean;
  /** Bookings in range with no staff member assigned in any of the three assignment columns yet. */
  unassignedCount: number;
  totalInRange: number;
}

/**
 * Credits a booking to a staff member if THEY appear in any of the
 * three assignment columns (assigned_agent_id/assigned_admin_id/
 * assigned_sub_admin_id) — not agent-only. A booking with both an
 * admin and an agent assigned genuinely counts for both; that's real
 * shared responsibility, not double-counting an error.
 */
export async function getTeamPerformance(startDate: string, endDate: string): Promise<TeamPerformanceResult> {
  const client = getSupabaseClient();
  const LIMIT = 2000;
  const { data, error } = await client
    .from("bookings")
    .select("assigned_agent_id, assigned_admin_id, assigned_sub_admin_id, booking_status")
    .gte("date", startDate)
    .lte("date", endDate)
    .limit(LIMIT + 1);
  if (error) throw error;
  const rows = data ?? [];
  const truncated = rows.length > LIMIT;
  const scoped = truncated ? rows.slice(0, LIMIT) : rows;

  const byStaff = new Map<string, { assigned: number; completed: number; pending: number; cancelled: number }>();
  let unassignedCount = 0;
  for (const r of scoped) {
    const staffIds = [r.assigned_agent_id, r.assigned_admin_id, r.assigned_sub_admin_id].filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    if (staffIds.length === 0) {
      unassignedCount += 1;
      continue;
    }
    for (const staffId of new Set(staffIds)) {
      const entry = byStaff.get(staffId) ?? { assigned: 0, completed: 0, pending: 0, cancelled: 0 };
      entry.assigned += 1;
      if (r.booking_status === "completed") entry.completed += 1;
      else if (CANCELLED_STATUSES.has(r.booking_status as string)) entry.cancelled += 1;
      else if (PENDING_STATUSES.has(r.booking_status as string)) entry.pending += 1;
      byStaff.set(staffId, entry);
    }
  }

  // Cash collected, credited to whoever actually recorded it
  // (cash_collections.recorded_by) rather than whoever the booking is
  // assigned to — an admin can record cash on a booking an agent
  // collected the sample for, and crediting the wrong person would
  // misstate both their numbers. new_amount - previous_amount per row
  // (not new_amount alone, which is a running total) so multiple
  // partial recordings on the same booking sum to the real total
  // collected, not an inflated cumulative figure.
  const { data: cashRows, error: cashError } = await client
    .from("cash_collections")
    .select("recorded_by, previous_amount, new_amount, bookings!inner(date)")
    .gte("bookings.date", startDate)
    .lte("bookings.date", endDate)
    .limit(5000);
  if (cashError) throw cashError;
  const cashByStaff = new Map<string, number>();
  for (const row of cashRows ?? []) {
    const uid = row.recorded_by as string;
    const delta = Number(row.new_amount ?? 0) - Number(row.previous_amount ?? 0);
    cashByStaff.set(uid, (cashByStaff.get(uid) ?? 0) + delta);
  }

  const staffIds = [...new Set([...byStaff.keys(), ...cashByStaff.keys()])];
  const names = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: profileRows, error: profileError } = await client.from("profiles").select("id, name, email").in("id", staffIds);
    if (profileError) throw profileError;
    for (const p of profileRows ?? []) names.set(p.id, p.name || p.email || p.id);
  }

  const performance: AgentPerformance[] = staffIds.map((uid) => {
    const e = byStaff.get(uid) ?? { assigned: 0, completed: 0, pending: 0, cancelled: 0 };
    return {
      uid,
      name: names.get(uid) ?? uid,
      assigned: e.assigned,
      completed: e.completed,
      pending: e.pending,
      cancelled: e.cancelled,
      completionRate: e.assigned > 0 ? Math.round((e.completed / e.assigned) * 100) : 0,
      cashCollected: cashByStaff.get(uid) ?? 0,
    };
  });

  return { performance, truncated, unassignedCount, totalInRange: scoped.length };
}

/**
 * The real bookings behind one staff member's row in getTeamPerformance
 * above — matches its own crediting rule exactly (any of the three
 * assignment columns, not just assigned_agent_id), so a click-through
 * never comes up empty for an admin/sub-admin whose credit came from a
 * column this didn't think to check.
 */
export async function getBookingsForStaffMember(
  staffUid: string,
  startDate: string,
  endDate: string
): Promise<Booking[]> {
  const { data, error } = await getSupabaseClient()
    .from("bookings")
    .select("*, booking_items(*)")
    .gte("date", startDate)
    .lte("date", endDate)
    .or(`assigned_agent_id.eq.${staffUid},assigned_admin_id.eq.${staffUid},assigned_sub_admin_id.eq.${staffUid}`)
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(rowToBooking);
}

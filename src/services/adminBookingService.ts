// Supabase-backed. getAdminBookings used to call a Cloud Function
// (getAdminBookings) that was never deployed on the Firebase Spark
// plan -- every call threw BackendRequiredError, which is the exact
// "This feature needs a Cloud Function..." message the admin dashboard
// showed. RLS's bookings_select policy is the real hierarchy boundary
// now (SUPER_ADMIN sees all, ADMIN sees assigned/confirmed, SUB_ADMIN
// their own assignments, COLLECTION_AGENT their own assignments), so a
// plain filtered select replaces the callable outright.
import { getSupabaseClient } from "@/supabase/client";
import { rowToBooking } from "@/supabase/bookingMappers";
import type { Booking, BookingStatus } from "@/types/booking";

export interface GetAdminBookingsRequest {
  startDate: string;
  endDate: string;
  filterAdminId?: string;
  filterSubAdminId?: string;
  filterAgentId?: string;
  filterLabId?: string;
  filterBookingStatus?: string;
  filterPaymentStatus?: string;
}

const BOOKING_SELECT = "*, booking_items(*)";
const ADMIN_BOOKING_LIMIT = 1000;

export async function getAdminBookings(payload: GetAdminBookingsRequest): Promise<{ bookings: Booking[]; truncated: boolean }> {
  let query = getSupabaseClient()
    .from("bookings")
    .select(BOOKING_SELECT)
    .gte("date", payload.startDate)
    .lte("date", payload.endDate)
    .order("created_at", { ascending: false })
    .limit(ADMIN_BOOKING_LIMIT + 1);

  if (payload.filterAdminId) query = query.eq("assigned_admin_id", payload.filterAdminId);
  if (payload.filterSubAdminId) query = query.eq("assigned_sub_admin_id", payload.filterSubAdminId);
  if (payload.filterAgentId) query = query.eq("assigned_agent_id", payload.filterAgentId);
  if (payload.filterLabId) query = query.eq("lab_id", payload.filterLabId);
  if (payload.filterBookingStatus) query = query.eq("booking_status", payload.filterBookingStatus);
  if (payload.filterPaymentStatus) query = query.eq("payment_status", payload.filterPaymentStatus);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const truncated = rows.length > ADMIN_BOOKING_LIMIT;
  return { bookings: (truncated ? rows.slice(0, ADMIN_BOOKING_LIMIT) : rows).map(rowToBooking), truncated };
}

export async function assignBooking(bookingId: string, agentUid: string): Promise<{ ok: true }> {
  const { error } = await getSupabaseClient().rpc("assign_booking", {
    p_booking_id: bookingId,
    p_agent_id: agentUid,
    p_note: null,
  });
  if (error) throw error;
  return { ok: true };
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus, note?: string): Promise<{ ok: true }> {
  const { error } = await getSupabaseClient().rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
  return { ok: true };
}

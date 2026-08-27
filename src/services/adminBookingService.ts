import { callFunction } from "@/firebase/functions";
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

// Hierarchy-scoped server-side (see functions/src/adminQueries.ts) —
// this is the only place the admin panel reads bookings from, so the
// Dashboard's KPIs and the Bookings table can never disagree.
export async function getAdminBookings(payload: GetAdminBookingsRequest): Promise<{ bookings: Booking[]; truncated: boolean }> {
  return callFunction<GetAdminBookingsRequest, { bookings: Booking[]; truncated: boolean }>("getAdminBookings", payload);
}

export async function assignBooking(bookingId: string, agentUid: string): Promise<{ ok: true }> {
  return callFunction<{ bookingId: string; agentUid: string }, { ok: true }>("assignBooking", { bookingId, agentUid });
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus, note?: string): Promise<{ ok: true }> {
  return callFunction<{ bookingId: string; status: BookingStatus; note?: string }, { ok: true }>(
    "updateBookingStatus",
    { bookingId, status, note }
  );
}

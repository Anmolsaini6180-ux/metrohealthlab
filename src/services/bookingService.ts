// Supabase-backed. Booking creation goes through the
// create_website_booking_cart RPC (SECURITY DEFINER) instead of a
// client-side insert: it re-derives every item's price from its own
// lab_pricing row, the collection fee from service_areas, atomically
// reserves the slot (UPDATE ... WHERE booked_count < capacity), and
// verifies patient_id/address_id actually belong to the caller —
// server-side, in one transaction. See
// supabase/migrations/20260917194500_add_cart_support_booking_items_and_rpc.sql.
// The original single-item create_website_booking RPC still exists in
// the database (nothing dropped it) but has no caller left in this
// app — createCashBooking, the frontend wrapper around it, was removed
// once the cart flow replaced every place that called it.
//
// getBookingQuote/createBooking (the old Cloud-Function-calling pair)
// are removed: nothing in the app called them (grepped for
// "getBookingQuote"/`from ".../bookingService"` — no live caller), and
// they pointed at Cloud Functions that were never deployed on Spark.
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
import { rowToBooking, rowToBookingStatusHistory } from "@/supabase/bookingMappers";
import type { Booking, BookingStatusHistoryEntry, CollectionType } from "@/types/booking";
import type { CartItem } from "@/types/cart";

type Unsubscribe = () => void;
// Explicit column list on the embedded booking_items, NOT `(*)` — this
// is the customer-facing read path (see the header comment above), and
// booking_items now has a `tp` (internal cost) column. Omitting it
// here means it is never present in the response body at all, not
// just unused by the UI: the distinction matters because RLS lets a
// customer legitimately read their OWN booking's items (row-level
// access is correct for them), so only leaving tp out of the query
// itself — not a display choice — keeps it out of what reaches the
// browser. adminBookingService.ts/adminCustomerService.ts keep their
// own separate `booking_items(*)` for staff, who are meant to see it.
const BOOKING_SELECT = "*, booking_items(id, booking_id, item_type, ref_id, name, lab_id, price)";

// Type-only holdover from the removed Cloud-Function quote call:
// BookingFlowPage still types its own client-computed price preview
// against this same shape (see its own setQuote() call), so the
// interface stays even though nothing calls getBookingQuote() anymore.
export interface GetBookingQuoteResponse {
  quoteId: string;
  subtotal: number;
  collectionFee: number;
  discount: number;
  finalAmount: number;
  currency: "INR";
  couponApplied: boolean;
  couponMessage?: string;
  expiresAt: string;
}

export interface CreateCashBookingCartInput {
  items: CartItem[];
  serviceAreaId: string;
  collectionType: CollectionType;
  addressId?: string;
  date: string;
  slotId: string;
  contact?: { name?: string; phone?: string; address?: string };
  patientId: string;
  notes?: string;
}

/** Cart checkout — create_website_booking_cart validates every item
 * resolves to the same lab, sums their prices server-side, and writes
 * one bookings row plus one booking_items row per item. See
 * supabase/migrations/20260917194500_add_cart_support_booking_items_and_rpc.sql. */
export async function createCashBookingCart(
  input: CreateCashBookingCartInput
): Promise<{ bookingId: string; finalAmount: number }> {
  const { data, error } = await getSupabaseClient().rpc("create_website_booking_cart", {
    p_items: input.items.map((i) => ({
      pricing_ref_id: i.pricingRefId,
      item_type: i.itemType,
      item_ref_id: i.refId,
      item_name: i.name,
    })),
    p_service_area_id: input.serviceAreaId,
    p_collection_type: input.collectionType,
    p_date: input.date,
    p_slot_id: input.slotId,
    p_contact: input.contact ?? {},
    p_address: input.contact?.address ?? null,
    p_patient_id: input.patientId || null,
    p_address_id: input.addressId ?? null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
  const row = data as unknown as Record<string, unknown>;
  return { bookingId: row.id as string, finalAmount: Number(row.final_amount ?? 0) };
}

async function fetchUserBookings(userId: string): Promise<Booking[]> {
  const { data, error } = await getSupabaseClient()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToBooking);
}

/** The signed-in customer's own bookings, newest first. */
export function subscribeToUserBookings(
  userId: string,
  callback: (bookings: Booking[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => fetchUserBookings(userId).then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges(
    `bookings-user-${userId}`,
    { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` },
    refetch,
    onError
  );
}

/**
 * The whole booking book, for the admin dashboard. RLS's bookings_select
 * policy is what actually restricts this to SUPER_ADMIN/ADMIN (plus
 * scoped SUB_ADMIN/COLLECTION_AGENT visibility) — a customer session
 * calling this simply gets back only their own row(s), same fail-safe
 * shape the Firestore rules had.
 */
export function subscribeToAdminBookings(
  callback: (bookings: Booking[]) => void,
  onError?: (error: Error) => void,
  max = 500
): Unsubscribe {
  const refetch = async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("bookings")
        .select(BOOKING_SELECT)
        .order("created_at", { ascending: false })
        .limit(max);
      if (error) throw error;
      callback((data ?? []).map(rowToBooking));
    } catch (err) {
      onError?.(err as Error);
    }
  };
  refetch();
  return subscribeToTableChanges("bookings-admin-all", { event: "*", schema: "public", table: "bookings" }, refetch, onError);
}

export async function getUserBookings(userId: string): Promise<Booking[]> {
  return fetchUserBookings(userId);
}

export async function getBookingById(bookingId: string): Promise<Booking | null> {
  const { data, error } = await getSupabaseClient().from("bookings").select(BOOKING_SELECT).eq("id", bookingId).maybeSingle();
  if (error) throw error;
  return data ? rowToBooking(data) : null;
}

/** Realtime tracking: an admin status/cash update pushes to the
 * customer's tracking page with no refresh needed. */
export function subscribeToBooking(
  bookingId: string,
  callback: (booking: Booking | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getBookingById(bookingId).then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges(
    `booking-${bookingId}`,
    { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
    refetch,
    onError
  );
}

export function subscribeToBookingStatusHistory(
  bookingId: string,
  callback: (history: BookingStatusHistoryEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("booking_status_history")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      callback((data ?? []).map(rowToBookingStatusHistory));
    } catch (err) {
      onError?.(err as Error);
    }
  };
  refetch();
  return subscribeToTableChanges(
    `booking-status-history-${bookingId}`,
    { event: "*", schema: "public", table: "booking_status_history", filter: `booking_id=eq.${bookingId}` },
    refetch,
    onError
  );
}

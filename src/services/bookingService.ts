// Supabase-backed. Booking creation goes through the create_website_booking
// RPC (SECURITY DEFINER) instead of a client-side insert: it re-derives
// price from lab_pricing and the collection fee from service_areas,
// atomically reserves the slot (UPDATE ... WHERE booked_count < capacity),
// and verifies patient_id/address_id actually belong to the caller —
// server-side, in one transaction. This is the real implementation of
// what the old Firestore comments described as "intended" for an
// undeployed Cloud Function; here it is deployed and live.
//
// getBookingQuote/createBooking (the old Cloud-Function-calling pair)
// are removed: nothing in the app called them (grepped for
// "getBookingQuote"/`from ".../bookingService"` — no live caller), and
// they pointed at Cloud Functions that were never deployed on Spark.
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { rowToBooking, rowToBookingStatusHistory } from "@/supabase/bookingMappers";
import type { Booking, BookingItem, BookingStatusHistoryEntry, CollectionType } from "@/types/booking";

type Unsubscribe = () => void;
const BOOKING_SELECT = "*, booking_items(*)";

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

export interface CreateCashBookingInput {
  userId: string;
  patientId: string;
  item: BookingItem;
  /** lab_pricing row the price came from — the RPC verifies against it. */
  pricingRefId: string;
  /** service_areas row the pincode/fee came from. */
  serviceAreaId: string;
  labId: string;
  labName?: string;
  collectionType: CollectionType;
  addressId?: string;
  pincode: string;
  collectionFee: number;
  date: string;
  slotId: string;
  contact?: { name?: string; phone?: string; address?: string };
}

export async function createCashBooking(
  input: CreateCashBookingInput
): Promise<{ bookingId: string; finalAmount: number }> {
  const { data, error } = await getSupabaseClient().rpc("create_website_booking", {
    p_pricing_ref_id: input.pricingRefId,
    p_service_area_id: input.serviceAreaId,
    p_item_type: input.item.itemType,
    p_item_ref_id: input.item.refId,
    p_item_name: input.item.name,
    p_collection_type: input.collectionType,
    p_date: input.date,
    p_slot_id: input.slotId,
    p_contact: input.contact ?? {},
    p_address: input.contact?.address ?? null,
    p_patient_id: input.patientId || null,
    p_address_id: input.addressId ?? null,
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
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`bookings-user-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
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
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel("bookings-admin-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
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
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`booking-${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
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
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`booking-status-history-${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_status_history", filter: `booking_id=eq.${bookingId}` }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
}

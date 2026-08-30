// Supabase-backed. createStaffBooking is a direct table insert, same
// shape as the Firestore version's own design: RLS's bookings_insert_staff
// policy is the boundary (staff-only, source pinned to admin/whatsapp,
// created_by must match the caller, no assignment fields at creation) —
// staff are trusted to type the correct price for a phone/WhatsApp
// booking, same as the old firestore.rules never re-derived it either.
//
// recordCashReceived/setBookingStatus go through the record_cash_received/
// set_booking_status RPCs (Phase A) instead of a raw update: both are
// SECURITY DEFINER and recompute the cash arithmetic server-side, and
// both also insert the audit trail (cash_collections /
// booking_status_history) atomically in the same transaction — the
// Firestore version had no equivalent audit trail at all (see the
// original file's own comment: "the rules re-verify the arithmetic on
// every update" was the entire boundary, with no history recorded).
import { getSupabaseClient } from "@/supabase/client";
import { cashStateFor } from "@/utils/cashState";
import type { Booking, BookingItem, BookingSource, BookingStatus, CollectionType } from "@/types/booking";

export interface StaffBookingInput {
  /** Existing customer uuid when known; staff bookings may have none. */
  userId?: string;
  patientId?: string;
  item: BookingItem;
  labId: string;
  labName?: string;
  collectionType: CollectionType;
  pincode?: string;
  date: string;
  slotId?: string;
  finalAmount: number;
  amountReceived: number;
  source: Extract<BookingSource, "admin" | "whatsapp">;
  contact: { name: string; phone: string; address?: string; email?: string };
  notes?: string;
}

function generateReference(): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `MH${datePart}${randomPart}`;
}

/**
 * Creates a booking taken by staff — a phone call, a walk-in, or a
 * pasted WhatsApp message. Source is set by the caller and constrained
 * by RLS to admin/whatsapp, so it can never be passed off as a website
 * booking.
 */
export async function createStaffBooking(
  actorUid: string,
  input: StaffBookingInput
): Promise<{ bookingId: string }> {
  const cash = cashStateFor(input.finalAmount, input.amountReceived);
  const client = getSupabaseClient();

  const { data: booking, error } = await client
    .from("bookings")
    .insert({
      reference: generateReference(),
      user_id: input.userId ?? null,
      patient_id: input.patientId ?? null,
      lab_id: input.labId,
      lab_name: input.labName ?? null,
      collection_type: input.collectionType,
      pincode: input.pincode ?? null,
      date: input.date,
      slot_id: input.slotId ?? null,
      subtotal: input.item.price,
      collection_fee: Math.max(input.finalAmount - input.item.price, 0),
      discount: 0,
      final_amount: input.finalAmount,
      amount_received: cash.amountReceived,
      payment_status: cash.paymentStatus,
      payment_method: "cash_on_home",
      source: input.source,
      booking_status: "confirmed",
      contact: input.contact,
      notes: input.notes ?? null,
      created_by: actorUid,
      updated_by: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemError } = await client.from("booking_items").insert({
    booking_id: booking.id,
    item_type: input.item.itemType,
    ref_id: input.item.refId,
    name: input.item.name,
    lab_id: input.item.labId || input.labId,
    price: input.item.price,
  });
  if (itemError) throw itemError;

  const { error: historyError } = await client.from("booking_status_history").insert({
    booking_id: booking.id,
    status: "confirmed",
    created_by: actorUid,
  });
  if (historyError) throw historyError;

  return { bookingId: booking.id };
}

/**
 * Records the cash a collector actually took. `amountReceived` is the
 * new cumulative total, not a delta, so replaying the request cannot
 * double-count — enforced the same way inside the RPC.
 */
export async function recordCashReceived(
  _actorUid: string,
  booking: Pick<Booking, "id" | "finalAmount">,
  amountReceived: number
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("record_cash_received", {
    p_booking_id: booking.id,
    p_amount_received: amountReceived,
    p_note: null,
  });
  if (error) throw error;
}

/** Moves a booking's operational status. Cash fields are untouched —
 * the RPC only changes booking_status and logs the transition. */
export async function setBookingStatus(
  _actorUid: string,
  booking: Pick<Booking, "id" | "finalAmount" | "amountReceived">,
  status: BookingStatus
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("set_booking_status", {
    p_booking_id: booking.id,
    p_status: status,
    p_note: null,
  });
  if (error) throw error;
}

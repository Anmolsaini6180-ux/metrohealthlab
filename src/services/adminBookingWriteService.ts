// Supabase-backed. createStaffBooking goes through the create_staff_booking
// RPC (SECURITY DEFINER) rather than a direct table insert: the actorUid
// this file used to write straight into created_by/updated_by is the
// app's FIREBASE uid (StaffContext.uid stays Firebase-shaped — see
// src/supabase/roleService.ts), never the live Supabase session's real
// auth.uid(). A direct insert with created_by = actorUid would never
// satisfy an RLS with_check requiring created_by = auth.uid(), so this
// would have silently failed for every real booking made through the
// actual admin UI. The RPC derives created_by from the session itself,
// removing the client-supplied uid from the trust boundary entirely —
// exactly like create_website_booking already does for customers.
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

/**
 * Creates a booking taken by staff — a phone call, a walk-in, or a
 * pasted WhatsApp message. Source is set by the caller and validated
 * server-side to admin/whatsapp, so it can never be passed off as a
 * website booking. `actorUid` is accepted for call-site compatibility
 * but intentionally unused — see the header comment above.
 */
export async function createStaffBooking(
  _actorUid: string,
  input: StaffBookingInput
): Promise<{ bookingId: string }> {
  const { data, error } = await getSupabaseClient().rpc("create_staff_booking", {
    p_user_id: input.userId ?? null,
    p_patient_id: input.patientId ?? null,
    p_lab_id: input.labId,
    p_lab_name: input.labName ?? null,
    p_collection_type: input.collectionType,
    p_pincode: input.pincode ?? null,
    p_date: input.date,
    p_slot_id: input.slotId ?? null,
    p_final_amount: input.finalAmount,
    p_amount_received: input.amountReceived,
    p_source: input.source,
    p_contact: input.contact,
    p_notes: input.notes ?? null,
    p_item_type: input.item.itemType,
    p_item_ref_id: input.item.refId,
    p_item_name: input.item.name,
    p_item_lab_id: input.item.labId || input.labId,
    p_item_price: input.item.price,
  });
  if (error) throw error;
  return { bookingId: (data as unknown as { id: string }).id };
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

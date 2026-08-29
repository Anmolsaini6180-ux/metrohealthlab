import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { stripUndefined } from "@/utils/firestoreData";
import { cashStateFor } from "@/utils/cashState";
import type { Booking, BookingItem, BookingSource, BookingStatus, CollectionType } from "@/types/booking";

const BOOKINGS = "bookings";

// Staff booking writes, straight to Firestore.
//
// firestore.rules is the boundary here, not this file: it allows these
// writes only for SUPER_ADMIN/SUPER, re-checks the cash arithmetic, and
// pins which keys an update may touch (so userId, finalAmount, items
// and source cannot be rewritten after the fact). Everything below
// simply produces a document shaped the way those rules require.

export interface StaffBookingInput {
  /** Existing customer uid when known; staff bookings may have none. */
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
 * pasted WhatsApp message. Source is set by the caller and constrained
 * by rules to admin/whatsapp, so it can never be passed off as a
 * website booking.
 */
export async function createStaffBooking(
  actorUid: string,
  input: StaffBookingInput
): Promise<{ bookingId: string }> {
  const cash = cashStateFor(input.finalAmount, input.amountReceived);

  const payload = stripUndefined({
    // A staff booking may be for someone with no account yet; the
    // contact snapshot is then the only customer identity it carries.
    userId: input.userId ?? "",
    patientId: input.patientId ?? "",
    items: [input.item],
    labId: input.labId,
    labName: input.labName,
    collectionType: input.collectionType,
    pincode: input.pincode,
    date: input.date,
    slotId: input.slotId ?? "",
    subtotal: input.item.price,
    collectionFee: Math.max(input.finalAmount - input.item.price, 0),
    discount: 0,
    finalAmount: input.finalAmount,
    amountReceived: cash.amountReceived,
    pendingAmount: cash.pendingAmount,
    paymentStatus: cash.paymentStatus,
    paymentMethod: "cash_on_home" as const,
    source: input.source,
    bookingStatus: "confirmed" as const,
    contact: input.contact,
    notes: input.notes,
    createdBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(getDb(), BOOKINGS), payload);
  return { bookingId: ref.id };
}

/**
 * Records the cash a collector actually took. `amountReceived` is the
 * new cumulative total, not a delta, so replaying the request cannot
 * double-count. The derived fields are recomputed here and re-checked
 * by the rules.
 */
export async function recordCashReceived(
  actorUid: string,
  booking: Pick<Booking, "id" | "finalAmount">,
  amountReceived: number
): Promise<void> {
  const cash = cashStateFor(booking.finalAmount, amountReceived);
  await updateDoc(doc(getDb(), BOOKINGS, booking.id), {
    amountReceived: cash.amountReceived,
    pendingAmount: cash.pendingAmount,
    paymentStatus: cash.paymentStatus,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Moves a booking's operational status. The cash fields are re-sent
 * unchanged because the rules re-verify the arithmetic on every update.
 */
export async function setBookingStatus(
  actorUid: string,
  booking: Pick<Booking, "id" | "finalAmount" | "amountReceived">,
  status: BookingStatus
): Promise<void> {
  const cash = cashStateFor(booking.finalAmount, booking.amountReceived ?? 0);
  await updateDoc(doc(getDb(), BOOKINGS, booking.id), {
    bookingStatus: status,
    amountReceived: cash.amountReceived,
    pendingAmount: cash.pendingAmount,
    paymentStatus: cash.paymentStatus,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

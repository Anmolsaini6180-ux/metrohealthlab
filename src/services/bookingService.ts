import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import { stripUndefined } from "@/utils/firestoreData";
import type { Booking, BookingItem, BookingStatusHistoryEntry, CollectionType } from "@/types/booking";

const BOOKINGS = "bookings";
const BOOKING_STATUS_HISTORY = "bookingStatusHistory";

export interface CreateBookingRequest {
  patientId: string;
  items: BookingItem[];
  labId: string;
  collectionType: CollectionType;
  addressId?: string;
  pincode: string;
  date: string;
  slotId: string;
  couponCode?: string;
  // Cash on home is the only method this deployment offers; online
  // payment is deliberately out of scope, so no gateway method exists
  // here and nothing can mark a booking paid at creation time. Mirrors
  // functions/src/createBooking.ts.
  paymentMethod: "cash_on_home";
  /** Contact snapshot stored on the booking for the admin screen. */
  contact?: { name?: string; phone?: string; address?: string };
  idempotencyKey: string;
  // Purely informational — links the booking to the quote shown on the
  // review screen for support/audit purposes. Never trusted for pricing.
  quoteId?: string;
}

export interface CreateBookingResponse {
  bookingId: string;
  finalAmount: number;
}

export interface QuoteItem {
  itemType: "test" | "package";
  refId: string;
  name: string;
}

export interface GetBookingQuoteRequest {
  patientId: string;
  items: QuoteItem[];
  labId: string;
  collectionType: CollectionType;
  addressId?: string;
  pincode: string;
  couponCode?: string;
}

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

// The ONLY source of truth for what the review screen shows. Computed
// server-side from the same trusted Firestore data createBooking itself
// uses — the frontend never calculates subtotal/collectionFee/discount/
// finalAmount independently. This is a preview only: it doesn't reserve
// a slot or record coupon usage, and createBooking recomputes everything
// from scratch regardless of what this returned.
export async function getBookingQuote(payload: GetBookingQuoteRequest): Promise<GetBookingQuoteResponse> {
  return callFunction<GetBookingQuoteRequest, GetBookingQuoteResponse>("getBookingQuote", payload);
}

// Booking creation is intentionally NOT a plain Firestore write from the
// client. It calls a Cloud Function so the server can, in one atomic
// transaction: validate the slot has capacity, recompute pricing from
// trusted data, validate the coupon, generate the booking ID, and create
// the booking + decrement slot capacity together. Implement this
// function at functions/src/createBooking.ts (see functions/README.md).
export async function createBooking(payload: CreateBookingRequest): Promise<CreateBookingResponse> {
  return callFunction<CreateBookingRequest, CreateBookingResponse>("createBooking", payload);
}

// ---------- Spark booking creation (direct Firestore) ----------
//
// There are no Cloud Functions on this project, so bookings are written
// straight from the client. That is only safe because firestore.rules
// re-derives every figure from the catalogue documents the booking
// names: `pricingRefId` (a labPricing row) fixes the item price and the
// lab, and `serviceAreaId` fixes the pincode and its collection fee. A
// browser that edits any amount fails the write rather than
// under-charging. See the "customer-created cash bookings" suite in
// tests/rules for the exact cases that proves.
//
// The rules also pin cash-on-home to start unpaid, so nothing here can
// mark a booking paid.

export interface CreateCashBookingInput {
  userId: string;
  patientId: string;
  item: BookingItem;
  /** labPricing document the price came from — rules verify against it. */
  pricingRefId: string;
  /** serviceAreas document the pincode/fee came from. */
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

export async function createCashBooking(input: CreateCashBookingInput): Promise<{ bookingId: string; finalAmount: number }> {
  const subtotal = input.item.price;
  const finalAmount = subtotal + input.collectionFee;

  const payload = stripUndefined({
    userId: input.userId,
    patientId: input.patientId,
    items: [input.item],
    labId: input.labId,
    labName: input.labName,
    pricingRefId: input.pricingRefId,
    serviceAreaId: input.serviceAreaId,
    collectionType: input.collectionType,
    addressId: input.addressId ?? null,
    pincode: input.pincode,
    date: input.date,
    slotId: input.slotId,
    subtotal,
    collectionFee: input.collectionFee,
    // Coupons need atomic usage counters, which a client cannot do —
    // so a customer-created booking never carries a discount.
    discount: 0,
    finalAmount,
    amountReceived: 0,
    pendingAmount: finalAmount,
    paymentMethod: "cash_on_home" as const,
    paymentStatus: "pending" as const,
    bookingStatus: "confirmed" as const,
    source: "website" as const,
    contact: input.contact,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(getDb(), BOOKINGS), payload);
  return { bookingId: ref.id, finalAmount };
}

// ---------- Realtime subscriptions ----------

/** The signed-in customer's own bookings, newest first. */
export function subscribeToUserBookings(
  userId: string,
  callback: (bookings: Booking[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), BOOKINGS), where("userId", "==", userId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking))),
    (err) => onError?.(err)
  );
}

/**
 * The whole booking book, for the admin dashboard. Rules allow this
 * unscoped list only for SUPER_ADMIN/ADMIN; every other caller is
 * refused, which is what keeps this from being a data leak.
 */
export function subscribeToAdminBookings(
  callback: (bookings: Booking[]) => void,
  onError?: (error: Error) => void,
  max = 500
): Unsubscribe {
  const q = query(collection(getDb(), BOOKINGS), orderBy("createdAt", "desc"), fsLimit(max));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking))),
    (err) => onError?.(err)
  );
}

export async function getUserBookings(userId: string): Promise<Booking[]> {
  const q = query(collection(getDb(), BOOKINGS), where("userId", "==", userId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}

export async function getBookingById(bookingId: string): Promise<Booking | null> {
  const snap = await getDoc(doc(getDb(), BOOKINGS, bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Booking;
}

// Realtime tracking: when the (future) admin panel updates
// bookingStatus, this listener pushes the change to the customer's
// tracking page with no refresh needed.
export function subscribeToBooking(
  bookingId: string,
  callback: (booking: Booking | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), BOOKINGS, bookingId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Booking) : null),
    (err) => onError?.(err)
  );
}

export function subscribeToBookingStatusHistory(
  bookingId: string,
  callback: (history: BookingStatusHistoryEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(getDb(), BOOKING_STATUS_HISTORY),
    where("bookingId", "==", bookingId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookingStatusHistoryEntry))),
    (err) => onError?.(err)
  );
}

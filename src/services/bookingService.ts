import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
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

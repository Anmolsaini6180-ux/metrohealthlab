export type CollectionType = "home" | "center";

// Cash on home only — there is no online payment gateway. A booking
// created through create_website_booking/create_staff_booking starts
// "confirmed" directly; "payment_pending" is kept in the enum for any
// pre-migration historical row that used it, not written by anything
// live today.
export type BookingStatus =
  | "payment_pending"
  | "confirmed"
  | "assigned"
  | "on_the_way"
  | "arrived"
  | "sample_collected"
  | "received_at_lab"
  | "testing"
  | "report_ready"
  | "completed"
  | "cancelled"
  | "refunded";

export interface BookingItem {
  itemType: "test" | "package";
  refId: string; // testId or packageId
  name: string;
  labId: string;
  price: number;
  /**
   * Internal cost, snapshotted at booking time — STAFF-ONLY.
   * undefined for every customer-facing read (bookingService.ts's own
   * BOOKING_SELECT never asks for this column at all); null means a
   * staff-created booking whose item had no tp entered yet. Never
   * default this to 0 for a margin calculation — that would draw a
   * fake 100% margin on an unpriced item.
   */
  tp?: number | null;
}

// Where the booking came from. Reporting depends on this being set at
// creation by the pathway itself, never supplied by a browser.
export type BookingSource = "website" | "whatsapp" | "admin";

export type PaymentMethod = "cash_on_home";

export type PaymentStatus = "pending" | "partially_paid" | "paid" | "cancelled";

// A copy of the customer/item details as they were when the booking was
// placed. Catalogue prices and customer profiles change; an operations
// screen and a printed receipt must keep showing what was actually
// agreed, so the booking carries its own snapshot rather than joining
// back to live documents.
export interface BookingContactSnapshot {
  name: string;
  phone: string;
  address?: string;
}

export interface Booking {
  /** The real Postgres uuid primary key — used for routing/lookups, never shown to a customer or staff member (see `reference` for that). */
  id: string;
  /** The human-facing booking number (e.g. MH-260906-A1B2C), generated server-side by whichever booking-creation RPC ran. Always set — every booking-creation path writes one, and it is NOT NULL in the database. */
  reference: string;
  userId: string;
  patientId: string;
  items: BookingItem[];
  labId: string;
  /** Lab name as it was at booking time. */
  labName?: string;
  contact?: BookingContactSnapshot;
  collectionType: CollectionType;
  addressId?: string; // required if collectionType === "home"
  date: string; // ISO date
  slotId: string;
  couponId?: string;
  subtotal: number;
  collectionFee: number;
  discount: number;
  finalAmount: number;
  /**
   * Cash actually collected, only ever moved by staff through the
   * server. 0 on every new cash-on-home booking — a booking is never
   * paid because the browser said so.
   */
  amountReceived?: number;
  /**
   * Derived and stored server-side as finalAmount - amountReceived,
   * floored at 0. Stored (not computed on read) so admin list queries
   * can filter and total it without loading every document.
   */
  pendingAmount?: number;
  paymentMethod?: PaymentMethod;
  source?: BookingSource;
  paymentStatus: PaymentStatus | "processing" | "success" | "failed" | "refunded" | "cash_pending";
  bookingStatus: BookingStatus;
  // Set by assignBooking (Cloud Function) once operations assigns a
  // collector — denormalized up the chain so hierarchy-scoped admin
  // queries/rules never need a lookup into the collector's own user doc.
  assignedAgentId?: string;
  assignedSubAdminId?: string;
  assignedAdminId?: string;
  /**
   * Free-text instructions/notes captured at booking time. Only ever
   * set today by create_staff_booking (a phone/WhatsApp booking taken
   * by staff) — create_website_booking has no equivalent input yet, so
   * this is undefined on every self-service website booking. Real,
   * confirmed gap: the customer-facing flow has no "special
   * instructions" step to write one, even though it's a real column.
   */
  notes?: string;
  createdAt: unknown; // Firestore server timestamp
  updatedAt: unknown;
}

export interface BookingStatusHistoryEntry {
  id: string;
  bookingId: string;
  status: BookingStatus;
  note?: string;
  createdAt: unknown;
}

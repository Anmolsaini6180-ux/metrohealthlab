export type CollectionType = "home" | "center";

// "payment_pending" replaces the old generic "pending": every booking
// starts here (even cash-on-collection, for the instant between
// createBooking and createPaymentOrder) and only createPaymentOrder /
// the Razorpay webhook are allowed to move it to "confirmed".
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
  id: string; // e.g. MH26082000001, generated server-side
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

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

export interface Booking {
  id: string; // e.g. MH26082000001, generated server-side
  userId: string;
  patientId: string;
  items: BookingItem[];
  labId: string;
  collectionType: CollectionType;
  addressId?: string; // required if collectionType === "home"
  date: string; // ISO date
  slotId: string;
  couponId?: string;
  subtotal: number;
  collectionFee: number;
  discount: number;
  finalAmount: number;
  paymentStatus: "pending" | "processing" | "success" | "failed" | "refunded" | "cash_pending";
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

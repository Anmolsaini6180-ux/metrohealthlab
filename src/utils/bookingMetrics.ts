import type { Booking } from "@/types/booking";

// Dashboard arithmetic, kept pure so the numbers an operator acts on
// are provable rather than assembled inline in a component.
//
// The money split matters and is deliberate: "booking value" is what
// was agreed, "received" is cash actually collected, "pending" is what
// is still owed. Calling booking value "revenue" would overstate income
// on a cash book where nothing has been collected yet.

export interface BookingMetrics {
  total: number;
  today: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  inProgress: number;
  paymentPending: number;
  partiallyPaid: number;
  paid: number;
  bookingValue: number;
  amountReceived: number;
  pendingAmount: number;
}

const IN_PROGRESS_STATUSES = new Set([
  "assigned",
  "on_the_way",
  "arrived",
  "sample_collected",
  "received_at_lab",
  "testing",
  "report_ready",
]);

/** A booking's own outstanding balance, tolerating older documents. */
export function pendingFor(booking: Booking): number {
  if (typeof booking.pendingAmount === "number") return Math.max(booking.pendingAmount, 0);
  return Math.max(booking.finalAmount - (booking.amountReceived ?? 0), 0);
}

export function receivedFor(booking: Booking): number {
  return Math.max(booking.amountReceived ?? 0, 0);
}

export function computeBookingMetrics(bookings: Booking[], today: Date = new Date()): BookingMetrics {
  const todayKey = toDateKey(today);

  const metrics: BookingMetrics = {
    total: bookings.length,
    today: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    inProgress: 0,
    paymentPending: 0,
    partiallyPaid: 0,
    paid: 0,
    bookingValue: 0,
    amountReceived: 0,
    pendingAmount: 0,
  };

  for (const b of bookings) {
    if (b.date === todayKey) metrics.today += 1;

    if (b.bookingStatus === "confirmed") metrics.confirmed += 1;
    else if (b.bookingStatus === "completed") metrics.completed += 1;
    else if (b.bookingStatus === "cancelled" || b.bookingStatus === "refunded") metrics.cancelled += 1;
    else if (IN_PROGRESS_STATUSES.has(b.bookingStatus)) metrics.inProgress += 1;

    // Cancelled bookings are excluded from the money totals: money that
    // will never be collected is not a receivable.
    const cancelled = b.bookingStatus === "cancelled" || b.bookingStatus === "refunded";
    if (!cancelled) {
      metrics.bookingValue += b.finalAmount;
      metrics.amountReceived += receivedFor(b);
      metrics.pendingAmount += pendingFor(b);

      if (b.paymentStatus === "paid") metrics.paid += 1;
      else if (b.paymentStatus === "partially_paid") metrics.partiallyPaid += 1;
      else metrics.paymentPending += 1;
    }
  }

  return metrics;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface BookingFilters {
  search: string;
  bookingStatus: string;
  paymentStatus: string;
  source: string;
}

export const EMPTY_FILTERS: BookingFilters = { search: "", bookingStatus: "", paymentStatus: "", source: "" };

/**
 * Applies the dashboard's search and filters. Search matches booking
 * id, customer name, phone and item names — the things an operator
 * actually has to hand when someone rings up.
 */
export function filterBookings(bookings: Booking[], filters: BookingFilters): Booking[] {
  const needle = filters.search.trim().toLowerCase();

  return bookings.filter((b) => {
    if (filters.bookingStatus && b.bookingStatus !== filters.bookingStatus) return false;
    if (filters.paymentStatus && b.paymentStatus !== filters.paymentStatus) return false;
    if (filters.source && (b.source ?? "website") !== filters.source) return false;
    if (!needle) return true;

    const haystack = [
      b.id,
      b.contact?.name ?? "",
      b.contact?.phone ?? "",
      b.labName ?? "",
      ...b.items.map((i) => i.name),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

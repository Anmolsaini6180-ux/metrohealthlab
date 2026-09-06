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
  /** Not cancelled/refunded/completed, and nobody in any of the three assignment columns. */
  unassigned: number;
  /** Not cancelled/refunded/completed, and at least one assignment column set. */
  assigned: number;
  onTheWay: number;
  /** Has a real start_at within the next 2 hours (not in the past) and hasn't progressed past "assigned" yet. */
  startingSoon: number;
  /** Has a real start_at already in the past and still hasn't reached a real operational status — mirrors run_booking_automation()'s own "not progressed" definition, but this is a DISPLAY count only; the database function is what actually decides whether to alert. */
  overdue: number;
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

// Mirrors run_booking_automation()'s own v_not_progressed definition —
// kept as one named set here so the dashboard's "Overdue" card count
// and the database's own overdue alerts can never silently drift into
// disagreeing about what "not progressed" means. Exported so
// automationState.ts (the customer tracker's equivalent display) shares
// this exact same definition instead of keeping its own copy.
export const PROGRESSED_STATUSES = new Set(["on_the_way", "arrived", "sample_collected", "received_at_lab", "testing", "report_ready"]);

export function isUnassigned(b: Booking): boolean {
  return !b.assignedAgentId && !b.assignedAdminId && !b.assignedSubAdminId;
}

/** A booking's own outstanding balance, tolerating older documents. */
export function pendingFor(booking: Booking): number {
  if (typeof booking.pendingAmount === "number") return Math.max(booking.pendingAmount, 0);
  return Math.max(booking.finalAmount - (booking.amountReceived ?? 0), 0);
}

export function receivedFor(booking: Booking): number {
  return Math.max(booking.amountReceived ?? 0, 0);
}

export function computeBookingMetrics(bookings: Booking[], today: Date = new Date(), now: Date = new Date()): BookingMetrics {
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
    unassigned: 0,
    assigned: 0,
    onTheWay: 0,
    startingSoon: 0,
    overdue: 0,
  };

  for (const b of bookings) {
    if (b.date === todayKey) metrics.today += 1;

    if (b.bookingStatus === "confirmed") metrics.confirmed += 1;
    else if (b.bookingStatus === "completed") metrics.completed += 1;
    else if (b.bookingStatus === "cancelled" || b.bookingStatus === "refunded") metrics.cancelled += 1;
    else if (IN_PROGRESS_STATUSES.has(b.bookingStatus)) metrics.inProgress += 1;

    if (b.bookingStatus === "on_the_way") metrics.onTheWay += 1;

    const terminal = b.bookingStatus === "cancelled" || b.bookingStatus === "refunded" || b.bookingStatus === "completed";
    if (!terminal) {
      if (isUnassigned(b)) metrics.unassigned += 1;
      else metrics.assigned += 1;

      if (b.startAt) {
        const minutesUntil = (new Date(b.startAt).getTime() - now.getTime()) / 60000;
        if (minutesUntil > 0 && minutesUntil <= 120) metrics.startingSoon += 1;
        else if (minutesUntil <= 0 && !PROGRESSED_STATUSES.has(b.bookingStatus)) metrics.overdue += 1;
      }
    }

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

export type QuickFilter = "" | "today" | "tomorrow" | "next24h" | "unassigned" | "assigned" | "startingSoon" | "overdue" | "completed";

export interface BookingFilters {
  search: string;
  bookingStatus: string;
  paymentStatus: string;
  source: string;
  /** Collection date, "YYYY-MM-DD". Empty means every date. */
  date: string;
  /** The "Upcoming & Attention Required" quick-filter chips — a second, independent dimension from the dropdowns above (both apply together). */
  quickFilter: QuickFilter;
}

export const EMPTY_FILTERS: BookingFilters = {
  search: "",
  bookingStatus: "",
  paymentStatus: "",
  source: "",
  date: "",
  quickFilter: "",
};

/**
 * Applies the dashboard's search and filters. Search matches the
 * booking's real id, its human-facing reference (MH-260906-A1B2C —
 * what a customer would actually read out over a call), customer
 * name, phone and item names — the things an operator actually has to
 * hand when someone rings up.
 */
export function filterBookings(bookings: Booking[], filters: BookingFilters, now: Date = new Date()): Booking[] {
  const needle = filters.search.trim().toLowerCase();
  const todayKey = toDateKey(now);
  const tomorrowKey = toDateKey(new Date(now.getTime() + 24 * 60 * 60000));
  const next24h = new Date(now.getTime() + 24 * 60 * 60000);

  return bookings.filter((b) => {
    if (filters.bookingStatus && b.bookingStatus !== filters.bookingStatus) return false;
    if (filters.paymentStatus && b.paymentStatus !== filters.paymentStatus) return false;
    if (filters.source && (b.source ?? "website") !== filters.source) return false;
    if (filters.date && b.date !== filters.date) return false;

    const terminal = b.bookingStatus === "cancelled" || b.bookingStatus === "refunded" || b.bookingStatus === "completed";
    const unassigned = isUnassigned(b);
    const minutesUntil = b.startAt ? (new Date(b.startAt).getTime() - now.getTime()) / 60000 : null;

    switch (filters.quickFilter) {
      case "today":
        if (b.date !== todayKey) return false;
        break;
      case "tomorrow":
        if (b.date !== tomorrowKey) return false;
        break;
      case "next24h":
        if (!b.startAt || new Date(b.startAt) > next24h || new Date(b.startAt) < now) return false;
        break;
      case "unassigned":
        if (terminal || !unassigned) return false;
        break;
      case "assigned":
        if (terminal || unassigned) return false;
        break;
      case "startingSoon":
        if (terminal || minutesUntil === null || minutesUntil <= 0 || minutesUntil > 120) return false;
        break;
      case "overdue":
        if (terminal || minutesUntil === null || minutesUntil > 0 || PROGRESSED_STATUSES.has(b.bookingStatus)) return false;
        break;
      case "completed":
        if (b.bookingStatus !== "completed") return false;
        break;
      default:
        break;
    }

    if (!needle) return true;

    const haystack = [
      b.id,
      b.reference,
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

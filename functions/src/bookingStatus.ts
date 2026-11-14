// The booking lifecycle, in one place so adminBookingActions,
// createBooking and the cash-collection endpoint cannot drift apart.
// This mirrors src/types/booking.ts on the frontend.

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

export const BOOKING_STATUSES: BookingStatus[] = [
  "payment_pending",
  "confirmed",
  "assigned",
  "on_the_way",
  "arrived",
  "sample_collected",
  "received_at_lab",
  "testing",
  "report_ready",
  "completed",
  "cancelled",
  "refunded",
];

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as string[]).includes(value);
}

/** Statuses from which no further operational progress is possible. */
export function isTerminal(status: BookingStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "refunded";
}

/**
 * A cash-on-home booking is confirmed the moment it is placed — there
 * is no payment step to wait on. `payment_pending` exists for the
 * online flow, which this deployment does not offer.
 */
export const CASH_ON_HOME_INITIAL_STATUS: BookingStatus = "confirmed";

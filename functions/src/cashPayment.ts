import { HttpsError } from "firebase-functions/v2/https";
import type { BookingStatus } from "./bookingStatus";

// Cash-on-home money rules, kept pure so they can be proven rather than
// hoped at. Nothing here reads a request body: every caller passes the
// booking's own stored finalAmount, which came from server-side pricing.

export type PaymentStatus = "pending" | "partially_paid" | "paid" | "cancelled";

export interface PaymentState {
  amountReceived: number;
  pendingAmount: number;
  paymentStatus: PaymentStatus;
}

/** Money is stored in whole rupees; anything else is a bug upstream. */
function assertMoney(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", `${label} must be a number.`);
  }
  if (value < 0) {
    throw new HttpsError("invalid-argument", `${label} cannot be negative.`);
  }
  if (Math.round(value) !== value) {
    throw new HttpsError("invalid-argument", `${label} must be a whole rupee amount.`);
  }
}

/**
 * The state a brand-new cash-on-home booking starts in: nothing
 * collected, the whole amount outstanding, and explicitly unpaid. A
 * booking is never created paid, whatever the browser sends.
 */
export function initialCashState(finalAmount: number): PaymentState {
  assertMoney(finalAmount, "Booking amount");
  return { amountReceived: 0, pendingAmount: finalAmount, paymentStatus: "pending" };
}

/**
 * Applies a cash collection. `amountReceived` is the new cumulative
 * total collected, not a delta — the admin screen shows and edits a
 * running total, and making the wire value absolute keeps a retried
 * request idempotent instead of double-counting.
 */
export function applyCashReceived(finalAmount: number, amountReceived: number): PaymentState {
  assertMoney(finalAmount, "Booking amount");
  assertMoney(amountReceived, "Amount received");

  if (amountReceived > finalAmount) {
    throw new HttpsError(
      "invalid-argument",
      `Amount received (₹${amountReceived}) cannot exceed the booking amount (₹${finalAmount}).`
    );
  }

  const pendingAmount = finalAmount - amountReceived;
  const paymentStatus: PaymentStatus =
    amountReceived === 0 ? "pending" : pendingAmount === 0 ? "paid" : "partially_paid";

  return { amountReceived, pendingAmount, paymentStatus };
}

/**
 * Recording cash against a cancelled booking is refused rather than
 * silently accepted — a cancelled booking quietly becoming "paid" is
 * how a reconciliation ends up wrong.
 */
export function assertCollectable(bookingStatus: BookingStatus): void {
  if (bookingStatus === "cancelled" || bookingStatus === "refunded") {
    throw new HttpsError("failed-precondition", "This booking is cancelled — cash cannot be recorded against it.");
  }
}

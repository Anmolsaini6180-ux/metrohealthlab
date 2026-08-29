import type { PaymentStatus } from "@/types/booking";

// The single client-side definition of what a cash payment means.
//
// It is deliberately the same arithmetic firestore.rules enforces on
// every booking write (cashStatusFor / the create and update rules), so
// the UI and the security boundary can never disagree about whether a
// booking is paid. Mirrors functions/src/cashPayment.ts for the day the
// server-side path is deployed.

export interface CashState {
  amountReceived: number;
  pendingAmount: number;
  paymentStatus: PaymentStatus;
}

/** Clamps to the range the rules will accept, so the UI cannot offer an impossible value. */
export function clampReceived(finalAmount: number, amountReceived: number): number {
  if (!Number.isFinite(amountReceived) || amountReceived < 0) return 0;
  return Math.min(Math.round(amountReceived), Math.max(Math.round(finalAmount), 0));
}

export function cashStateFor(finalAmount: number, amountReceived: number): CashState {
  const total = Math.max(Math.round(finalAmount), 0);
  const received = clampReceived(total, amountReceived);
  const pendingAmount = total - received;

  const paymentStatus: PaymentStatus =
    received === 0 ? "pending" : pendingAmount === 0 ? "paid" : "partially_paid";

  return { amountReceived: received, pendingAmount, paymentStatus };
}

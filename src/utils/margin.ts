// Shared by every admin-only screen that shows profitability (package/
// test edit forms, admin booking detail). Never imported by anything
// customer-facing — there is nothing here a customer query could even
// reach (tp is absent from their data entirely, see the packages_public/
// tests_public views and bookingService.ts's BOOKING_SELECT), but the
// computation itself is also just not something a customer page has
// any reason to run.

export interface Margin {
  /** Selling price minus internal cost. Can be negative — a real loss-leader, not a bug. */
  amount: number;
  /** Margin as a percentage of selling price. null when sellingPrice is 0 (division makes no sense). */
  percent: number | null;
}

/**
 * `tp` of `null`/`undefined` means "no cost entered yet" — returns
 * `null` rather than guessing 0, which would otherwise draw a false
 * 100% margin on a package nobody has priced internally yet. Callers
 * should render an explicit "— (enter TP to see margin)" for a null
 * result rather than a number.
 */
export function computeMargin(sellingPrice: number, tp: number | null | undefined): Margin | null {
  if (tp == null) return null;
  const amount = sellingPrice - tp;
  const percent = sellingPrice > 0 ? (amount / sellingPrice) * 100 : null;
  return { amount, percent };
}

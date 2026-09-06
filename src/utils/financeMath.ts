import type { FinanceReport, FinanceReportRaw } from "@/types/finance";

/**
 * Turns get_finance_report()'s raw authoritative sums into the derived
 * dashboard cards. Every input here already came from one real SQL
 * aggregate (see the get_finance_report RPC) — this function only does
 * plain, denominator-free arithmetic on top of them, so it can't
 * introduce a fabricated figure or a divide-by-zero.
 *
 *   grossMargin  = totalRevenue - totalTp
 *   totalExpenses = manually-entered expenses + campaign ad spend
 *                   (a campaign's spend is real business marketing
 *                   cost; folding it into Expenses is what makes
 *                   "Campaign spend flows into Finance's Marketing
 *                   Expense reporting" true without also asking an
 *                   admin to double-enter it as a manual expense row)
 *   netProfit    = grossMargin - totalExpenses + otherIncome + adjustmentsNet
 *   outstanding  = totalRevenue - totalCollected
 *
 * refundedAmount is reported as-is, not subtracted again here: a
 * refunded booking is already excluded from totalRevenue/totalTp by
 * the RPC's own WHERE clause (booking_status <> 'cancelled' only keeps
 * refunded OUT via a separate `refunded` CTE), so double-counting it
 * as a further deduction would understate profit for money that was
 * never recognised as revenue in the first place.
 */
export function computeFinanceReport(raw: FinanceReportRaw): FinanceReport {
  const grossMargin = raw.totalRevenue - raw.totalTp;
  const totalExpenses = raw.expenses + raw.campaignSpend;
  const netProfit = grossMargin - totalExpenses + raw.otherIncome + raw.adjustmentsNet;
  const outstanding = raw.totalRevenue - raw.totalCollected;

  return { ...raw, grossMargin, totalExpenses, netProfit, outstanding };
}

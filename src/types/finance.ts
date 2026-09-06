// Manual finance entry types. Every one of these round-trips through
// record_financial_transaction() / get_finance_report() (SECURITY
// DEFINER RPCs, can_manage_catalog() gated) — there is no direct
// insert/update path, so a category typo here is a UI-only concern,
// never a way to bypass validation the database already re-checks.

export type TransactionType = "income" | "expense" | "adjustment";

export const INCOME_CATEGORIES = ["Other Income", "Lab Payment", "Service Income", "Misc Income"] as const;
export const EXPENSE_CATEGORIES = [
  "Staff Salary",
  "Collection Expense",
  "Lab Expense",
  "Marketing",
  "Advertising",
  "Rent",
  "Electricity",
  "Transportation",
  "Equipment",
  "Maintenance",
  "Other",
] as const;
// An adjustment corrects the ledger itself (a wrong earlier entry, a
// write-off) rather than recording a new real-world event — kept as
// its own short list so it's never confused with a normal expense.
export const ADJUSTMENT_CATEGORIES = ["Correction", "Write-off", "Other Adjustment"] as const;

export const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"] as const;

export interface FinancialTransaction {
  id: string;
  type: TransactionType;
  category: string;
  /** Always the real signed value: positive for income/expense, signed for adjustment (+ increases net profit, - decreases it). */
  amount: number;
  occurredOn: string;
  description?: string;
  reference?: string;
  paymentMethod?: string;
  attachmentUrl?: string;
  notes?: string;
  createdBy: string;
  createdAt: unknown;
}

export interface RecordTransactionInput {
  type: TransactionType;
  category: string;
  /** Always entered as a positive number in the UI; the adjustment sign is applied separately (see AddTransactionForm) so no one has to type a "-". */
  amount: number;
  occurredOn: string;
  description?: string;
  reference?: string;
  paymentMethod?: string;
  attachmentUrl?: string;
  notes?: string;
}

export interface FinanceRankedRow {
  refId: string;
  name: string;
  bookings: number;
  revenue: number;
  tp: number;
  /** Line items in this row with no captured TP (never silently folded into tp as if it were a real 0). */
  tpUnknown: number;
}

export interface FinanceCashByStaffRow {
  uid: string;
  name: string;
  collected: number;
}

// Raw shape of get_finance_report()'s jsonb result — every field here
// is a real SQL aggregate. Derived cards (grossMargin, totalExpenses,
// netProfit, outstanding) are computed from these in
// utils/financeMath.ts, not re-fetched or re-derived from bookings
// directly, so there is exactly one source of truth per number.
export interface FinanceReportRaw {
  totalRevenue: number;
  totalCollected: number;
  bookingsCount: number;
  totalTp: number;
  tpKnownCount: number;
  tpUnknownCount: number;
  otherIncome: number;
  expenses: number;
  campaignSpend: number;
  adjustmentsNet: number;
  refundedAmount: number;
  refundedCount: number;
  daily: { day: string; revenue: number; collected: number }[];
  byPackage: FinanceRankedRow[];
  byTest: FinanceRankedRow[];
  cashByStaff: FinanceCashByStaffRow[];
}

export interface FinanceReport extends FinanceReportRaw {
  outstanding: number;
  grossMargin: number;
  /** Manually-entered expenses + campaign ad spend for the range — see financeMath.ts for why these two are combined. */
  totalExpenses: number;
  netProfit: number;
}

export interface CampaignPerformance {
  id: string;
  name: string;
  status: string;
  spend: number;
  leads: number;
  converted: number;
  bookings: number;
  revenue: number;
  tp: number;
  tpUnknown: number;
  grossMargin: number;
  profit: number;
  /** null when spend is 0 — never a fake 0%/∞ figure. */
  roi: number | null;
  conversionRate: number | null;
  costPerLead: number | null;
  costPerBooking: number | null;
}

export interface PendingCollection {
  bookingId: string;
  date: string;
  customerName: string;
  finalAmount: number;
  amountReceived: number;
  outstanding: number;
  paymentStatus: string;
  bookingStatus: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
}

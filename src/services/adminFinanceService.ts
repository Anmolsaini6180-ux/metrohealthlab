// Supabase-backed. Every important total (revenue, collected, TP,
// margin, expenses) comes from get_finance_report() — a SECURITY
// DEFINER RPC gated by can_manage_catalog() that computes real SQL
// aggregates over bookings/booking_items/financial_transactions/
// campaigns — never a React-side recomputation from a partial page of
// rows. financeMath.ts then does only simple, denominator-free
// arithmetic (subtraction/addition) on top of those authoritative
// numbers to produce the derived dashboard cards.
import { getSupabaseClient } from "@/supabase/client";
import { computeFinanceReport } from "@/utils/financeMath";
import type { FinanceReport, FinanceReportRaw, FinancialTransaction, PendingCollection, RecordTransactionInput } from "@/types/finance";

function toRaw(json: unknown): FinanceReportRaw {
  const r = (json ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => Number(v ?? 0);
  return {
    totalRevenue: num(r.totalRevenue),
    totalCollected: num(r.totalCollected),
    bookingsCount: num(r.bookingsCount),
    totalTp: num(r.totalTp),
    tpKnownCount: num(r.tpKnownCount),
    tpUnknownCount: num(r.tpUnknownCount),
    otherIncome: num(r.otherIncome),
    expenses: num(r.expenses),
    campaignSpend: num(r.campaignSpend),
    adjustmentsNet: num(r.adjustmentsNet),
    refundedAmount: num(r.refundedAmount),
    refundedCount: num(r.refundedCount),
    daily: ((r.daily as unknown[]) ?? []).map((d) => {
      const row = d as Record<string, unknown>;
      return { day: row.day as string, revenue: num(row.revenue), collected: num(row.collected) };
    }),
    byPackage: ((r.byPackage as unknown[]) ?? []).map((p) => {
      const row = p as Record<string, unknown>;
      return { refId: row.refId as string, name: row.name as string, bookings: num(row.bookings), revenue: num(row.revenue), tp: num(row.tp), tpUnknown: num(row.tpUnknown) };
    }),
    byTest: ((r.byTest as unknown[]) ?? []).map((t) => {
      const row = t as Record<string, unknown>;
      return { refId: row.refId as string, name: row.name as string, bookings: num(row.bookings), revenue: num(row.revenue), tp: num(row.tp), tpUnknown: num(row.tpUnknown) };
    }),
    cashByStaff: ((r.cashByStaff as unknown[]) ?? []).map((s) => {
      const row = s as Record<string, unknown>;
      return { uid: row.uid as string, name: row.name as string, collected: num(row.collected) };
    }),
  };
}

export async function getFinanceReport(startDate: string, endDate: string): Promise<FinanceReport> {
  const { data, error } = await getSupabaseClient().rpc("get_finance_report", { p_start: startDate, p_end: endDate });
  if (error) throw error;
  return computeFinanceReport(toRaw(data));
}

function rowToTransaction(r: Record<string, unknown>): FinancialTransaction {
  return {
    id: r.id as string,
    type: r.type as FinancialTransaction["type"],
    category: r.category as string,
    amount: Number(r.amount ?? 0),
    occurredOn: r.occurred_on as string,
    description: (r.description as string) ?? undefined,
    reference: (r.reference as string) ?? undefined,
    paymentMethod: (r.payment_method as string) ?? undefined,
    attachmentUrl: (r.attachment_url as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    createdBy: r.created_by as string,
    createdAt: r.created_at,
  };
}

/**
 * The only way to write a financial_transactions row (see the table's
 * own RLS comment — there is no INSERT policy at all). Always lands an
 * audit_logs entry in the same transaction, server-side, so "who/when/
 * what/reason" is never something the client could omit or falsify.
 */
export async function recordFinancialTransaction(input: RecordTransactionInput): Promise<FinancialTransaction> {
  const { data, error } = await getSupabaseClient().rpc("record_financial_transaction", {
    p_type: input.type,
    p_category: input.category,
    p_amount: input.amount,
    p_occurred_on: input.occurredOn,
    p_description: input.description ?? null,
    p_reference: input.reference ?? null,
    p_payment_method: input.paymentMethod ?? null,
    p_attachment_url: input.attachmentUrl ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return rowToTransaction(data as Record<string, unknown>);
}

const TRANSACTION_LIMIT = 1000;

/**
 * Every manually-entered income/expense/adjustment row in range, most
 * recent first — a plain RLS-scoped read (financial_transactions_
 * select_admin = can_manage_catalog()), not a new RPC, since a filtered
 * SELECT needs no server-side aggregation. Powers both the on-page
 * transaction list and the CSV export.
 */
export async function getFinancialTransactions(startDate: string, endDate: string): Promise<{ rows: FinancialTransaction[]; truncated: boolean }> {
  const { data, error } = await getSupabaseClient()
    .from("financial_transactions")
    .select("*")
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(TRANSACTION_LIMIT + 1);
  if (error) throw error;
  const rows = data ?? [];
  const truncated = rows.length > TRANSACTION_LIMIT;
  return { rows: (truncated ? rows.slice(0, TRANSACTION_LIMIT) : rows).map(rowToTransaction), truncated };
}

const OUTSTANDING_LIMIT = 500;

/**
 * Collection Management's "who still owes money" view. A plain
 * RLS-scoped query, not a new RPC — bookings_select already lets
 * SUPER_ADMIN see every booking and every other can_manage_catalog()
 * role see their own assigned/confirmed slice, exactly the same
 * visibility Team Performance and Booking Management already work
 * within, so this reuses that boundary rather than adding a second one.
 */
export async function getPendingCollections(): Promise<{ rows: PendingCollection[]; truncated: boolean }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("bookings")
    .select("id, date, final_amount, amount_received, payment_status, booking_status, contact, assigned_agent_id")
    .neq("payment_status", "paid")
    .not("booking_status", "in", "(cancelled,refunded)")
    .order("date", { ascending: true })
    .limit(OUTSTANDING_LIMIT + 1);
  if (error) throw error;
  const rows = data ?? [];
  const truncated = rows.length > OUTSTANDING_LIMIT;
  const scoped = truncated ? rows.slice(0, OUTSTANDING_LIMIT) : rows;

  const agentIds = [...new Set(scoped.map((b) => b.assigned_agent_id as string | null).filter((id): id is string => !!id))];
  const agentNames = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: profiles, error: profileError } = await client.from("profiles").select("id, name, email").in("id", agentIds);
    if (profileError) throw profileError;
    for (const p of profiles ?? []) agentNames.set(p.id, p.name || p.email || p.id);
  }

  return {
    truncated,
    rows: scoped.map((b) => {
      const contact = (b.contact as { name?: string } | null) ?? {};
      const finalAmount = Number(b.final_amount ?? 0);
      const amountReceived = Number(b.amount_received ?? 0);
      return {
        bookingId: b.id as string,
        date: b.date as string,
        customerName: contact.name ?? "Unknown",
        finalAmount,
        amountReceived,
        outstanding: Math.max(finalAmount - amountReceived, 0),
        paymentStatus: b.payment_status as string,
        bookingStatus: b.booking_status as string,
        assignedAgentId: (b.assigned_agent_id as string) ?? undefined,
        assignedAgentName: b.assigned_agent_id ? agentNames.get(b.assigned_agent_id as string) ?? (b.assigned_agent_id as string) : undefined,
      };
    }),
  };
}

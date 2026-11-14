import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the Supabase query-builder shape: .rpc() captures exactly what
// getFinanceReport/recordFinancialTransaction sent it, and .from() a
// minimal chain covering only what getPendingCollections actually
// calls (select -> neq -> not -> order -> limit, then a second
// profiles lookup for agent names).
const state = vi.hoisted(() => ({
  rpcResult: null as unknown,
  rpcError: null as unknown,
  lastRpc: null as { name: string; args: Record<string, unknown> } | null,
  bookingRows: [] as Record<string, unknown>[],
  profileRows: [] as Record<string, unknown>[],
  transactionRows: [] as Record<string, unknown>[],
}));

function bookingsQuery() {
  const builder = {
    neq: () => builder,
    not: () => builder,
    order: () => builder,
    limit: async () => ({ data: state.bookingRows, error: null }),
  };
  return builder;
}

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "bookings") return { select: () => bookingsQuery() };
      if (table === "profiles") return { select: () => ({ in: async () => ({ data: state.profileRows, error: null }) }) };
      if (table === "financial_transactions") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => ({ order: () => ({ limit: async () => ({ data: state.transactionRows, error: null }) }) }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.lastRpc = { name, args };
      return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
    },
  }),
}));

const { getFinanceReport, recordFinancialTransaction, getPendingCollections, getFinancialTransactions } = await import("@/services/adminFinanceService");

beforeEach(() => {
  state.rpcResult = null;
  state.rpcError = null;
  state.lastRpc = null;
  state.bookingRows = [];
  state.profileRows = [];
  state.transactionRows = [];
});

describe("getFinanceReport", () => {
  it("calls get_finance_report with the exact range and defaults every missing field to a real zero, not undefined", async () => {
    state.rpcResult = {};
    const report = await getFinanceReport("2026-09-01", "2026-09-30");
    expect(state.lastRpc).toEqual({ name: "get_finance_report", args: { p_start: "2026-09-01", p_end: "2026-09-30" } });
    expect(report.totalRevenue).toBe(0);
    expect(report.daily).toEqual([]);
    expect(report.byPackage).toEqual([]);
    expect(report.cashByStaff).toEqual([]);
  });

  it("derives grossMargin/outstanding/netProfit from the RPC's raw authoritative sums (matches the worked Cash-on-Home example)", async () => {
    state.rpcResult = {
      totalRevenue: 1999, totalCollected: 0, totalTp: 900, expenses: 0, campaignSpend: 0, otherIncome: 0, adjustmentsNet: 0,
    };
    const report = await getFinanceReport("2026-09-01", "2026-09-01");
    expect(report.outstanding).toBe(1999);
    expect(report.grossMargin).toBe(1099);
    expect(report.netProfit).toBe(1099);
  });

  it("maps byPackage/byTest/cashByStaff rows through with their real field names", async () => {
    state.rpcResult = {
      byPackage: [{ refId: "pkg-1", name: "Full Body", bookings: 3, revenue: 6000, tp: 2700, tpUnknown: 1 }],
      cashByStaff: [{ uid: "agent-1", name: "Ravi", collected: 4500 }],
    };
    const report = await getFinanceReport("2026-09-01", "2026-09-30");
    expect(report.byPackage).toEqual([{ refId: "pkg-1", name: "Full Body", bookings: 3, revenue: 6000, tp: 2700, tpUnknown: 1 }]);
    expect(report.cashByStaff).toEqual([{ uid: "agent-1", name: "Ravi", collected: 4500 }]);
  });

  it("propagates an RPC error (e.g. a non-admin caller refused by can_manage_catalog()) instead of swallowing it", async () => {
    state.rpcError = new Error("You do not have permission to view finance data.");
    await expect(getFinanceReport("2026-09-01", "2026-09-30")).rejects.toThrow("permission");
  });
});

describe("recordFinancialTransaction", () => {
  it("sends every field to record_financial_transaction, defaulting unset optionals to null", async () => {
    state.rpcResult = { id: "txn-1", type: "expense", category: "Rent", amount: 15000, occurred_on: "2026-09-05", created_by: "admin-1", created_at: "2026-09-05T00:00:00Z" };
    await recordFinancialTransaction({ type: "expense", category: "Rent", amount: 15000, occurredOn: "2026-09-05" });
    expect(state.lastRpc).toEqual({
      name: "record_financial_transaction",
      args: {
        p_type: "expense", p_category: "Rent", p_amount: 15000, p_occurred_on: "2026-09-05",
        p_description: null, p_reference: null, p_payment_method: null, p_attachment_url: null, p_notes: null,
      },
    });
  });

  it("maps the returned row back to a FinancialTransaction", async () => {
    state.rpcResult = {
      id: "txn-2", type: "income", category: "Lab Payment", amount: 5000, occurred_on: "2026-09-05",
      description: "Referral commission", created_by: "admin-1", created_at: "2026-09-05T00:00:00Z",
    };
    const txn = await recordFinancialTransaction({ type: "income", category: "Lab Payment", amount: 5000, occurredOn: "2026-09-05", description: "Referral commission" });
    expect(txn).toEqual({
      id: "txn-2", type: "income", category: "Lab Payment", amount: 5000, occurredOn: "2026-09-05",
      description: "Referral commission", reference: undefined, paymentMethod: undefined, attachmentUrl: undefined, notes: undefined,
      createdBy: "admin-1", createdAt: "2026-09-05T00:00:00Z",
    });
  });

  it("propagates a validation error raised by the RPC (e.g. an adjustment with no reason) rather than masking it", async () => {
    state.rpcError = new Error("An adjustment needs a reason in the description.");
    await expect(recordFinancialTransaction({ type: "adjustment", category: "Correction", amount: -500, occurredOn: "2026-09-05" })).rejects.toThrow("reason");
  });
});

describe("getPendingCollections", () => {
  it("returns an empty, non-truncated result when nothing is outstanding", async () => {
    state.bookingRows = [];
    const result = await getPendingCollections();
    expect(result).toEqual({ rows: [], truncated: false });
  });

  it("computes outstanding as final_amount minus amount_received and resolves the assigned agent's name", async () => {
    state.bookingRows = [
      { id: "bk-1", date: "2026-09-05", final_amount: 1999, amount_received: 0, payment_status: "pending", booking_status: "confirmed", contact: { name: "Asha Rao" }, assigned_agent_id: "agent-1" },
    ];
    state.profileRows = [{ id: "agent-1", name: "Ravi Kumar", email: "ravi@example.com" }];

    const result = await getPendingCollections();
    expect(result.rows).toEqual([
      {
        bookingId: "bk-1", date: "2026-09-05", customerName: "Asha Rao",
        finalAmount: 1999, amountReceived: 0, outstanding: 1999,
        paymentStatus: "pending", bookingStatus: "confirmed",
        assignedAgentId: "agent-1", assignedAgentName: "Ravi Kumar",
      },
    ]);
  });

  it("never reports a negative outstanding figure even if amount_received somehow exceeds final_amount", async () => {
    state.bookingRows = [
      { id: "bk-2", date: "2026-09-05", final_amount: 999, amount_received: 1200, payment_status: "partially_paid", booking_status: "confirmed", contact: {}, assigned_agent_id: null },
    ];
    const result = await getPendingCollections();
    expect(result.rows[0].outstanding).toBe(0);
    expect(result.rows[0].assignedAgentName).toBeUndefined();
  });
});

describe("getFinancialTransactions", () => {
  it("maps rows through with real field names and reports truncated: false under the cap", async () => {
    state.transactionRows = [
      { id: "txn-1", type: "expense", category: "Rent", amount: 15000, occurred_on: "2026-09-01", description: null, reference: null, payment_method: "Bank Transfer", attachment_url: null, notes: null, created_by: "admin-1", created_at: "2026-09-01T00:00:00Z" },
    ];
    const result = await getFinancialTransactions("2026-09-01", "2026-09-30");
    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { id: "txn-1", type: "expense", category: "Rent", amount: 15000, occurredOn: "2026-09-01", description: undefined, reference: undefined, paymentMethod: "Bank Transfer", attachmentUrl: undefined, notes: undefined, createdBy: "admin-1", createdAt: "2026-09-01T00:00:00Z" },
    ]);
  });
});

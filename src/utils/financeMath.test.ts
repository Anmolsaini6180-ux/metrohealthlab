import { describe, expect, it } from "vitest";
import { computeFinanceReport } from "./financeMath";
import type { FinanceReportRaw } from "@/types/finance";

const BASE: FinanceReportRaw = {
  totalRevenue: 0,
  totalCollected: 0,
  bookingsCount: 0,
  totalTp: 0,
  tpKnownCount: 0,
  tpUnknownCount: 0,
  otherIncome: 0,
  expenses: 0,
  campaignSpend: 0,
  adjustmentsNet: 0,
  refundedAmount: 0,
  refundedCount: 0,
  daily: [],
  byPackage: [],
  byTest: [],
  cashByStaff: [],
};

describe("computeFinanceReport", () => {
  it("matches the master spec's worked TP+margin example (₹2,499 selling − ₹1,200 TP = ₹1,299 margin)", () => {
    const report = computeFinanceReport({ ...BASE, totalRevenue: 2499, totalTp: 1200 });
    expect(report.grossMargin).toBe(1299);
  });

  it("matches the worked Cash-on-Home example: a ₹1,999 confirmed booking is Revenue=1999, Collected=0, Outstanding=1999 before collection", () => {
    const before = computeFinanceReport({ ...BASE, totalRevenue: 1999, totalCollected: 0 });
    expect(before.outstanding).toBe(1999);

    const after = computeFinanceReport({ ...BASE, totalRevenue: 1999, totalCollected: 1999 });
    expect(after.outstanding).toBe(0);
  });

  it("matches the worked campaign example: revenue 45000, TP 21000, spend 8000 -> margin 24000, profit 16000", () => {
    const report = computeFinanceReport({ ...BASE, totalRevenue: 45000, totalTp: 21000, campaignSpend: 8000 });
    expect(report.grossMargin).toBe(24000);
    expect(report.totalExpenses).toBe(8000);
    expect(report.netProfit).toBe(16000);
  });

  it("folds manually-entered expenses and campaign spend together into totalExpenses", () => {
    const report = computeFinanceReport({ ...BASE, expenses: 5000, campaignSpend: 3000 });
    expect(report.totalExpenses).toBe(8000);
  });

  it("adds other income and adjustmentsNet into net profit (a positive adjustment increases it)", () => {
    const report = computeFinanceReport({ ...BASE, totalRevenue: 10000, otherIncome: 500, adjustmentsNet: 200 });
    expect(report.netProfit).toBe(10000 + 500 + 200);
  });

  it("a negative adjustment (a write-off) reduces net profit", () => {
    const report = computeFinanceReport({ ...BASE, totalRevenue: 10000, adjustmentsNet: -300 });
    expect(report.netProfit).toBe(9700);
  });

  it("does not double-subtract refunds — a refunded booking is already excluded from totalRevenue by the RPC, so refundedAmount is informational only", () => {
    const withRefund = computeFinanceReport({ ...BASE, totalRevenue: 10000, refundedAmount: 1999, refundedCount: 1 });
    const withoutRefund = computeFinanceReport({ ...BASE, totalRevenue: 10000 });
    expect(withRefund.netProfit).toBe(withoutRefund.netProfit);
    expect(withRefund.refundedAmount).toBe(1999);
  });

  it("passes every raw field through unchanged alongside the derived ones", () => {
    const raw: FinanceReportRaw = { ...BASE, byPackage: [{ refId: "p1", name: "Full Body", bookings: 2, revenue: 4000, tp: 1800, tpUnknown: 0 }] };
    const report = computeFinanceReport(raw);
    expect(report.byPackage).toEqual(raw.byPackage);
  });
});

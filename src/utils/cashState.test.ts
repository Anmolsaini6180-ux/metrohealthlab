import { describe, expect, it } from "vitest";
import { cashStateFor, clampReceived } from "@/utils/cashState";

// These assertions mirror the arithmetic firestore.rules enforces on
// every booking write. If this drifts, the UI will start producing
// documents the rules reject — so the two are pinned together here.
describe("cashStateFor", () => {
  it("starts a new booking fully outstanding and unpaid", () => {
    expect(cashStateFor(1050, 0)).toEqual({ amountReceived: 0, pendingAmount: 1050, paymentStatus: "pending" });
  });

  it("marks a booking paid when the full amount is collected", () => {
    expect(cashStateFor(1050, 1050)).toEqual({ amountReceived: 1050, pendingAmount: 0, paymentStatus: "paid" });
  });

  it("tracks a part payment and the balance still owed", () => {
    expect(cashStateFor(1050, 500)).toEqual({ amountReceived: 500, pendingAmount: 550, paymentStatus: "partially_paid" });
  });

  it("returns to pending when a collection is corrected back to zero", () => {
    expect(cashStateFor(1050, 0).paymentStatus).toBe("pending");
  });

  // Pending must never go negative — the rules reject that outright, so
  // the UI must never be able to offer it.
  it("clamps an overpayment to the booking amount instead of going negative", () => {
    expect(cashStateFor(1050, 5000)).toEqual({ amountReceived: 1050, pendingAmount: 0, paymentStatus: "paid" });
  });

  it("treats a negative or nonsense collection as zero", () => {
    expect(cashStateFor(1050, -20).amountReceived).toBe(0);
    expect(cashStateFor(1050, Number.NaN).amountReceived).toBe(0);
  });

  it("handles a zero-amount booking", () => {
    expect(cashStateFor(0, 0)).toEqual({ amountReceived: 0, pendingAmount: 0, paymentStatus: "pending" });
  });

  it("always keeps received + pending equal to the booking amount", () => {
    for (const received of [0, 1, 349, 1049, 1050, 99999]) {
      const s = cashStateFor(1050, received);
      expect(s.amountReceived + s.pendingAmount).toBe(1050);
      expect(s.pendingAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it("is idempotent — recording the same total twice changes nothing", () => {
    expect(cashStateFor(1050, 500)).toEqual(cashStateFor(1050, 500));
  });
});

describe("clampReceived", () => {
  it("keeps a value inside the range the rules accept", () => {
    expect(clampReceived(1000, 500)).toBe(500);
    expect(clampReceived(1000, 2000)).toBe(1000);
    expect(clampReceived(1000, -5)).toBe(0);
  });

  it("rounds to whole rupees", () => {
    expect(clampReceived(1000, 499.6)).toBe(500);
  });
});

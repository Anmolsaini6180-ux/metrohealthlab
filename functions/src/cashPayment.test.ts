import { describe, expect, it } from "vitest";
import { applyCashReceived, assertCollectable, initialCashState } from "./cashPayment";

describe("initialCashState", () => {
  // A booking is never created paid, whatever the browser sends.
  it("starts a cash booking fully outstanding and unpaid", () => {
    expect(initialCashState(1299)).toEqual({
      amountReceived: 0,
      pendingAmount: 1299,
      paymentStatus: "pending",
    });
  });

  it("handles a zero-amount booking", () => {
    expect(initialCashState(0)).toEqual({ amountReceived: 0, pendingAmount: 0, paymentStatus: "pending" });
  });

  it("rejects a negative or fractional booking amount", () => {
    expect(() => initialCashState(-1)).toThrow(/cannot be negative/i);
    expect(() => initialCashState(10.5)).toThrow(/whole rupee/i);
    expect(() => initialCashState(Number.NaN)).toThrow(/must be a number/i);
  });
});

describe("applyCashReceived", () => {
  it("marks a booking paid when the full amount is collected", () => {
    expect(applyCashReceived(1299, 1299)).toEqual({
      amountReceived: 1299,
      pendingAmount: 0,
      paymentStatus: "paid",
    });
  });

  it("tracks a part payment and the balance still owed", () => {
    expect(applyCashReceived(1299, 500)).toEqual({
      amountReceived: 500,
      pendingAmount: 799,
      paymentStatus: "partially_paid",
    });
  });

  it("returns to pending when a collection is corrected back to zero", () => {
    expect(applyCashReceived(1299, 0)).toEqual({
      amountReceived: 0,
      pendingAmount: 1299,
      paymentStatus: "pending",
    });
  });

  // Pending amount must never go negative, so overpayment is refused
  // rather than silently producing a negative balance.
  it("refuses more than the booking amount", () => {
    expect(() => applyCashReceived(1299, 1300)).toThrow(/cannot exceed/i);
  });

  it("refuses negative and fractional collections", () => {
    expect(() => applyCashReceived(1299, -5)).toThrow(/cannot be negative/i);
    expect(() => applyCashReceived(1299, 99.99)).toThrow(/whole rupee/i);
  });

  // The wire value is the cumulative total, so replaying the same
  // request cannot double-count.
  it("is idempotent when the same total is recorded twice", () => {
    const once = applyCashReceived(1299, 500);
    const twice = applyCashReceived(1299, 500);
    expect(twice).toEqual(once);
  });

  it("never produces a negative pending amount", () => {
    for (const received of [0, 1, 649, 1298, 1299]) {
      expect(applyCashReceived(1299, received).pendingAmount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("assertCollectable", () => {
  it("allows collection on live bookings", () => {
    expect(() => assertCollectable("confirmed")).not.toThrow();
    expect(() => assertCollectable("sample_collected")).not.toThrow();
    expect(() => assertCollectable("completed")).not.toThrow();
  });

  // A cancelled booking quietly becoming "paid" is how reconciliation
  // goes wrong.
  it("refuses collection on a cancelled or refunded booking", () => {
    expect(() => assertCollectable("cancelled")).toThrow(/cancelled/i);
    expect(() => assertCollectable("refunded")).toThrow(/cancelled/i);
  });
});

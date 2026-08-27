import { describe, it, expect } from "vitest";
import { calculateFinalAmount, computeCouponDiscount } from "./pricing";

// These two functions decide the amount a customer is actually charged.
// Everything here is about money being wrong in a way nobody notices.

describe("calculateFinalAmount", () => {
  it("adds the collection fee and subtracts the discount", () => {
    expect(calculateFinalAmount({ subtotal: 1000, collectionFee: 100, discount: 200 })).toBe(900);
  });

  it("never returns a negative amount when the discount exceeds the bill", () => {
    expect(calculateFinalAmount({ subtotal: 100, collectionFee: 0, discount: 500 })).toBe(0);
  });

  it("handles a zero discount", () => {
    expect(calculateFinalAmount({ subtotal: 499, collectionFee: 50, discount: 0 })).toBe(549);
  });
});

describe("computeCouponDiscount", () => {
  it("caps a flat discount at the base amount so it can never create a refund", () => {
    const discount = computeCouponDiscount({ discountType: "flat", discountValue: 900 }, 500);
    expect(discount).toBe(500);
  });

  it("applies a flat discount below the base amount as-is", () => {
    expect(computeCouponDiscount({ discountType: "flat", discountValue: 150 }, 500)).toBe(150);
  });

  it("computes a percentage discount and rounds it", () => {
    // 15% of 999 = 149.85
    expect(computeCouponDiscount({ discountType: "percentage", discountValue: 15 }, 999)).toBe(150);
  });

  it("respects maximumDiscount on a percentage coupon", () => {
    // 50% of 4000 = 2000, but the coupon caps at 300.
    const discount = computeCouponDiscount(
      { discountType: "percentage", discountValue: 50, maximumDiscount: 300 },
      4000
    );
    expect(discount).toBe(300);
  });

  it("ignores maximumDiscount when the computed percentage is lower", () => {
    const discount = computeCouponDiscount(
      { discountType: "percentage", discountValue: 10, maximumDiscount: 300 },
      1000
    );
    expect(discount).toBe(100);
  });

  it("a 100% coupon discounts the whole base amount, not more", () => {
    const discount = computeCouponDiscount({ discountType: "percentage", discountValue: 100 }, 750);
    expect(discount).toBe(750);
    expect(calculateFinalAmount({ subtotal: 750, collectionFee: 0, discount })).toBe(0);
  });
});

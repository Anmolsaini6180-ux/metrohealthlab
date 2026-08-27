import { describe, it, expect } from "vitest";
import { calculatePrice, formatCurrencyInr } from "./pricingService";

// The frontend formula is display-only, but if it drifts from the
// server's the customer sees one price on the review screen and gets
// charged another. These tests pin the shape of that formula.
describe("calculatePrice", () => {
  it("sums subtotal, collection fee and additional charges, then subtracts the discount", () => {
    const result = calculatePrice({ subtotal: 1000, collectionFee: 100, additionalCharges: 50, discount: 200 });
    expect(result.finalAmount).toBe(950);
  });

  it("defaults additionalCharges and discount to zero", () => {
    const result = calculatePrice({ subtotal: 800, collectionFee: 60 });
    expect(result).toEqual({
      subtotal: 800,
      collectionFee: 60,
      additionalCharges: 0,
      discount: 0,
      finalAmount: 860,
    });
  });

  it("floors at zero rather than producing a negative charge", () => {
    expect(calculatePrice({ subtotal: 200, collectionFee: 0, discount: 1000 }).finalAmount).toBe(0);
  });

  it("matches the server formula when there are no additional charges", () => {
    // functions/src/pricing.ts: max(0, subtotal + collectionFee - discount).
    // Additional charges are the only term the server formula omits, so
    // the two must agree whenever that term is zero.
    const serverFormula = (subtotal: number, collectionFee: number, discount: number) =>
      Math.max(0, subtotal + collectionFee - discount);

    const cases: [number, number, number][] = [
      [1000, 100, 200],
      [499, 50, 0],
      [100, 0, 500],
      [2500, 150, 375],
    ];

    for (const [subtotal, collectionFee, discount] of cases) {
      expect(calculatePrice({ subtotal, collectionFee, discount }).finalAmount).toBe(
        serverFormula(subtotal, collectionFee, discount)
      );
    }
  });
});

describe("formatCurrencyInr", () => {
  it("renders whole rupees with no decimals", () => {
    const formatted = formatCurrencyInr(1250);
    expect(formatted).toContain("1,250");
    expect(formatted).not.toContain(".");
  });

  it("renders zero", () => {
    expect(formatCurrencyInr(0)).toContain("0");
  });
});

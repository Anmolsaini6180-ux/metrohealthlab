export interface PriceBreakdownInput {
  subtotal: number;
  collectionFee: number;
  additionalCharges?: number;
  discount?: number;
}

export interface PriceBreakdown extends Required<Pick<PriceBreakdownInput, "subtotal" | "collectionFee">> {
  additionalCharges: number;
  discount: number;
  finalAmount: number;
}

// Single centralized pricing formula. This mirrors the formula the
// booking Cloud Function must also apply server-side — the frontend
// value here is DISPLAY ONLY. The Cloud Function recomputes this from
// trusted Firestore data before writing a booking; it never trusts a
// client-supplied finalAmount.
export function calculatePrice(input: PriceBreakdownInput): PriceBreakdown {
  const additionalCharges = input.additionalCharges ?? 0;
  const discount = input.discount ?? 0;
  const finalAmount = Math.max(
    0,
    input.subtotal + input.collectionFee + additionalCharges - discount
  );
  return {
    subtotal: input.subtotal,
    collectionFee: input.collectionFee,
    additionalCharges,
    discount,
    finalAmount,
  };
}

export function formatCurrencyInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

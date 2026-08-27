// Mirrors src/services/pricingService.ts on the frontend. Kept as a
// small, dependency-free function here (rather than importing across
// the functions/frontend boundary) so this file is the actual source of
// truth the server uses to compute the amount that gets charged.
export function calculateFinalAmount(params: {
  subtotal: number;
  collectionFee: number;
  discount: number;
}): number {
  return Math.max(0, params.subtotal + params.collectionFee - params.discount);
}

export function computeCouponDiscount(
  coupon: { discountType: "flat" | "percentage"; discountValue: number; maximumDiscount?: number },
  baseAmount: number
): number {
  if (coupon.discountType === "flat") return Math.min(coupon.discountValue, baseAmount);
  const pctValue = Math.round((baseAmount * coupon.discountValue) / 100);
  return Math.min(pctValue, coupon.maximumDiscount ?? Infinity);
}

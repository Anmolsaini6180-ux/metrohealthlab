export interface Coupon {
  id: string;
  code: string;
  discountType: "flat" | "percentage";
  discountValue: number;
  minimumOrder?: number;
  maximumDiscount?: number;
  applicableTests?: string[];
  applicablePackages?: string[];
  applicableLabs?: string[];
  applicableCities?: string[];
  firstOrderOnly?: boolean;
  // usageLimit is the admin-set cap on total global redemptions.
  // usedCount is a server-managed counter (never written by the
  // client) — validity is usedCount < usageLimit, not a decrementing
  // usageLimit, so the configured cap is never mutated by usage.
  usageLimit?: number;
  usedCount?: number;
  perUserLimit?: number;
  startDate: string;
  expiryDate: string;
  active: boolean;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

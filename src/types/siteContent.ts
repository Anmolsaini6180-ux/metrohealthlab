// Named, admin-editable long-form content blocks (site_content table)
// — distinct from src/types/content.ts (Banner/Offer/Article, each its
// own list of many rows). This is a fixed, known set of single named
// blocks: legal pages today, more as they gain a real editable home.
export const SITE_CONTENT_KEYS = [
  "terms",
  "privacy",
  "refund_policy",
  "booking_instructions",
  "sample_collection_info",
] as const;

export type SiteContentKey = (typeof SITE_CONTENT_KEYS)[number];

export const SITE_CONTENT_LABELS: Record<SiteContentKey, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refund_policy: "Cancellation & Refund Policy",
  booking_instructions: "Booking — special instructions help text",
  sample_collection_info: "Home sample collection — what to expect",
};

export interface SiteContentBlock {
  key: SiteContentKey;
  title?: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  updatedAt: unknown;
  updatedBy?: string;
}

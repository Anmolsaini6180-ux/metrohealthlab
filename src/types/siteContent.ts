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
  "homepage_final_cta",
] as const;

export type SiteContentKey = (typeof SITE_CONTENT_KEYS)[number];

export const SITE_CONTENT_LABELS: Record<SiteContentKey, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refund_policy: "Cancellation & Refund Policy",
  booking_instructions: "Booking — special instructions help text",
  sample_collection_info: "Home sample collection — what to expect",
  homepage_final_cta: "Homepage — bottom banner",
};

// Keys that are a full banner (eyebrow/heading/description/button/
// background image/active), not plain long-form text — the admin form
// and the public renderer both branch on this instead of hardcoding
// one key name, so a second banner-shaped block can reuse the same UI.
export const BANNER_CONTENT_KEYS: readonly SiteContentKey[] = ["homepage_final_cta"];

export interface SiteContentBlock {
  key: SiteContentKey;
  title?: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Banner-type keys only: lets admin hide the section without deleting its content. Defaults true. */
  active: boolean;
  updatedAt: unknown;
  updatedBy?: string;
}

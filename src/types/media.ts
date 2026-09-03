// "site_sections" is new: fixed, named image slots on pages that have
// no catalogue entity of their own to hang an imageUrl column off of
// (About/Contact/campaign banners). Which specific slot within it is
// recorded in relatedId, using the SiteSectionSlot values below - the
// exact same related_id convention "tests"/"packages"/"labs" already
// use to point an asset at one specific catalogue row.
export type MediaCategory = "branding" | "banners" | "tests" | "packages" | "labs" | "site_sections";

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  branding: "Branding",
  banners: "Banners",
  tests: "Tests",
  packages: "Packages",
  labs: "Labs",
  site_sections: "Site Sections",
};

// The fixed set of named slots addressable under category
// "site_sections". Kept short and specific to places that genuinely
// have no other admin-editable image field yet - a category card, a
// package, or a lab already have their own imageUrl-style column, so
// they are addressed by relatedId = that row's own id instead of a
// slot name from this list.
export type SiteSectionSlot = "about_hero" | "contact_image" | "campaign_banner";

export const SITE_SECTION_LABELS: Record<SiteSectionSlot, string> = {
  about_hero: "About Us — hero image",
  contact_image: "Contact Us — image",
  campaign_banner: "Marketing — campaign banner",
};

export interface MediaAsset {
  id: string;
  publicId: string;
  assetId: string;
  category: MediaCategory;
  relatedId: string | null;
  resourceType: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  folder: string;
  filename: string;
  secureUrl: string;
  /** Admin-facing label shown in the library grid; falls back to filename when unset. */
  title?: string;
  /** Accessibility text for wherever this asset is rendered publicly. */
  altText?: string;
  /** Soft-hide: false keeps the file (and the row) but stops public consumption from using it. */
  active: boolean;
  /** Lower sorts first when a slot resolves more than one candidate asset. */
  sortOrder: number;
  uploadedBy: string;
  uploadedAt?: unknown;
}

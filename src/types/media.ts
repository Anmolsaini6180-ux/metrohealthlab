// "site_sections" is new: fixed, named image slots on pages that have
// no catalogue entity of their own to hang an imageUrl column off of
// (About/Contact/campaign banners). Which specific slot within it is
// recorded in relatedId, using the SiteSectionSlot values below - the
// exact same related_id convention "tests"/"packages"/"labs" already
// use to point an asset at one specific catalogue row.
export type MediaCategory =
  | "branding"
  | "banners"
  | "tests"
  | "packages"
  | "labs"
  | "site_sections"
  // General-purpose stock-photo themes — not tied to one catalogue
  // row (nothing to set relatedId to), just licensed photography an
  // admin uploads once and then places anywhere an ImagePicker shows
  // (a site_sections slot today; more places as they gain one).
  // Actual image files come only from the business's own licensed/
  // supplied assets, uploaded through the admin media library —
  // never fabricated or extracted from an unlicensed reference image.
  | "healthcare_professionals"
  | "families"
  | "couples"
  | "senior_citizens"
  | "blood_collection"
  | "lab_testing"
  | "xray"
  | "diagnostics"
  | "home_collection"
  | "preventive_health"
  | "womens_health"
  | "mens_health"
  | "childrens_health"
  | "full_body_checkup"
  | "vitamin_testing"
  | "diabetes"
  | "heart_health";

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  branding: "Branding",
  banners: "Banners",
  tests: "Tests",
  packages: "Packages",
  labs: "Labs",
  site_sections: "Site Sections",
  healthcare_professionals: "Healthcare Professionals",
  families: "Families",
  couples: "Couples",
  senior_citizens: "Senior Citizens",
  blood_collection: "Blood Collection",
  lab_testing: "Lab Testing",
  xray: "X-Ray",
  diagnostics: "Diagnostics",
  home_collection: "Home Collection",
  preventive_health: "Preventive Health",
  womens_health: "Women's Health",
  mens_health: "Men's Health",
  childrens_health: "Children's Health",
  full_body_checkup: "Full Body Checkup",
  vitamin_testing: "Vitamin Testing",
  diabetes: "Diabetes",
  heart_health: "Heart Health",
};

// The fixed set of named slots addressable under category
// "site_sections". Kept short and specific to places that genuinely
// have no other admin-editable image field yet - a category card, a
// package, or a lab already have their own imageUrl-style column, so
// they are addressed by relatedId = that row's own id instead of a
// slot name from this list.
export type SiteSectionSlot =
  | "about_hero"
  | "contact_image"
  | "campaign_banner"
  | "home_collection_section"
  | "family_health_section"
  | "senior_health_section";

export const SITE_SECTION_LABELS: Record<SiteSectionSlot, string> = {
  about_hero: "About Us — hero image",
  contact_image: "Contact Us — image",
  campaign_banner: "Marketing — campaign banner",
  home_collection_section: "Homepage — Home Collection section image",
  family_health_section: "Homepage — Family Health section image",
  senior_health_section: "Homepage — Senior Health section image",
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

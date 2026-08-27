export type MediaCategory = "branding" | "banners" | "tests" | "packages" | "labs";

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  branding: "Branding",
  banners: "Banners",
  tests: "Tests",
  packages: "Packages",
  labs: "Labs",
};

// Written exclusively by the confirmMediaUpload Cloud Function from
// Cloudinary's own verified response — never by the client.
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
  uploadedBy: string;
  uploadedAt?: unknown;
}

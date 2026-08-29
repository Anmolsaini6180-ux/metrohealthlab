export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
  linkedin?: string;
}

// Single fixed document (settings/branding) — not a collection of
// many, since a business has exactly one of these at a time.
export interface BrandingSettings {
  businessName: string;
  tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  /** Short service-area label shown beside the mobile wordmark, e.g. "Ghaziabad, UP". */
  city?: string;
  socialLinks?: SocialLinks;
  updatedBy?: string;
  updatedAt?: unknown;
}

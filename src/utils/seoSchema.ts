import type { BrandingSettings } from "@/types/settings";
import { SITE_URL } from "@/components/common/Seo";

// Every builder here only ever reads fields that are ALREADY real,
// admin-entered data (settings/branding, or values passed in by the
// caller from a real catalog row) — never a fabricated rating, review,
// award, certification, or address. A field simply isn't included when
// the underlying data doesn't exist; that is deliberate, not a bug.

/** Organization schema — NOT LocalBusiness: this business has no public street address on file, and LocalBusiness's own schema.org guidance expects one. Safe to upgrade to LocalBusiness later if/when a real address is added to settings/branding. */
export function buildOrganizationSchema(branding: BrandingSettings | null) {
  if (!branding) return null;
  const sameAs = Object.values(branding.socialLinks ?? {}).filter((v): v is string => !!v);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: branding.businessName,
    url: SITE_URL,
    ...(branding.logoUrl ? { logo: branding.logoUrl } : {}),
    ...(branding.phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            telephone: branding.phone.startsWith("+") ? branding.phone : `+91${branding.phone.replace(/\D/g, "").slice(-10)}`,
            contactType: "customer service",
            ...(branding.email ? { email: branding.email } : {}),
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Metro Health Lab",
    url: SITE_URL,
  };
}

export function buildBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * FAQPage schema — ONLY call this with FAQs that are genuinely rendered
 * visibly on the page (Google's own structured-data guidelines require
 * this; a caller passing hidden/invented FAQs would violate both that
 * policy and this project's own "never fabricate content" rule).
 */
export function buildFaqSchema(faqs: { question: string; answer: string }[]) {
  if (faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/**
 * Product/Offer schema for a real, active, priced catalog item (test or
 * package). Deliberately carries NO aggregateRating/review block — this
 * project has no genuine per-item review data (a bare admin "rating"
 * number with no review count is not sufficient to back Google's
 * AggregateRating expectations), so none is fabricated. availability is
 * always InStock: a home-collection diagnostic test/package is a
 * service booking, not physical inventory that can run out.
 */
export function buildProductSchema(item: { name: string; description: string; price: number; path: string; image?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.description,
    ...(item.image ? { image: item.image } : {}),
    offers: {
      "@type": "Offer",
      price: item.price,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}${item.path}`,
    },
  };
}

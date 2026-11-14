import { Helmet } from "react-helmet-async";

// The ONE place every page's <head> tags come from — no page hand-rolls
// its own <title>/<meta> JSX. This app is a pure client-rendered SPA
// (no SSR/SSG framework), so these tags land in the DOM after React
// mounts and this component runs. Googlebot renders JavaScript and
// reads the post-render DOM for indexing (Google's own documented
// behaviour since 2019), so this genuinely affects what Google shows —
// but crawlers that do NOT execute JavaScript (Facebook/WhatsApp/
// LinkedIn/Twitter link-preview bots, and some non-Google search
// crawlers) only ever see index.html's static tags, never these.
// That is a real, disclosed limitation of this architecture, not
// something this component can fix — a genuine fix needs build-time
// prerendering of public routes, which is a separate, larger piece of
// work, not part of this pass.
const SITE_URL = "https://metrohealthlab.in";
const SITE_NAME = "Metro Health Lab";
const DEFAULT_OG_IMAGE = `${SITE_URL}/icons/icon-512.png`;

export interface SeoProps {
  /** Page-specific title WITHOUT the site name — this component appends " | Metro Health Lab" once, consistently, everywhere. */
  title: string;
  /** Real, specific description for this page — never a keyword-stuffed list, never fabricated. */
  description: string;
  /** Path only, e.g. "/tests/cbc-complete-blood-count" — the canonical origin is fixed to the one real production domain regardless of what host the page happened to load from (preview deploys, a stray www, etc.). */
  path: string;
  /** false for anything a search engine should never index: auth utility pages, the 404 page, every authenticated/admin route that somehow renders this component. Defaults to true. */
  index?: boolean;
  /** "website" for lists/home, "article" for blog posts, "product" is deliberately NOT used here — Google's product schema has stricter expectations (availability, real reviews) than a lab-test listing page satisfies. */
  ogType?: "website" | "article";
  /** Absolute image URL for social previews — falls back to the site's own icon, never a per-page image invented from nothing. */
  ogImage?: string;
  /** One or more JSON-LD objects to inject as <script type="application/ld+json">. Every property in these must correspond to real, truthful, already-available data — never fabricated ratings/reviews/certifications. */
  jsonLd?: object | object[];
}

export default function Seo({ title, description, path, index = true, ogType = "website", ogImage, jsonLd }: SeoProps) {
  const url = `${SITE_URL}${path}`;
  const fullTitle = `${title} | ${SITE_NAME}`;
  const image = ogImage || DEFAULT_OG_IMAGE;
  const ldBlocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta name="robots" content={index ? "index, follow" : "noindex, follow"} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {ldBlocks.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}

export { SITE_URL, SITE_NAME };

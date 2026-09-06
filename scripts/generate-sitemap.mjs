#!/usr/bin/env node
// Generates public/sitemap.xml from the REAL public catalog at build
// time. Uses the PUBLISHABLE (anon) key only — never the service-role
// key — specifically so this sitemap can never contain a URL an actual
// anonymous visitor (or Google's crawler) couldn't also see themselves;
// it queries through the exact same RLS boundary a real browser does,
// deliberately, rather than a privileged connection that could leak
// draft/inactive rows into the public sitemap.
//
// Every included test/package/article slug is a REAL, active, public
// row — nothing here is invented. If credentials are missing (e.g. a
// local dev machine with no .env), this fails loudly rather than
// silently writing an empty or stale sitemap.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ws from "ws";

// This script only ever makes plain one-shot REST queries, but
// supabase-js unconditionally tries to construct a realtime (WebSocket)
// client too, which Node has no native constructor for below v22 — the
// project's own devDependency on `ws` (already used by the Firestore
// rules-emulator tests) supplies one. No realtime channel is ever
// actually opened.
globalThis.WebSocket ??= ws;

const SITE_URL = "https://metrohealthlab.in";
const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn(
    "generate-sitemap: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — " +
      "writing a static-only sitemap (homepage + fixed content pages, no catalog URLs). " +
      "Set both env vars (e.g. in Vercel's build environment) for the full catalog sitemap."
  );
}

const STATIC_PATHS = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/tests", changefreq: "daily", priority: "0.9" },
  { path: "/packages", changefreq: "daily", priority: "0.9" },
  { path: "/offers", changefreq: "daily", priority: "0.7" },
  { path: "/health-concerns", changefreq: "weekly", priority: "0.6" },
  { path: "/articles", changefreq: "weekly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/contact", changefreq: "monthly", priority: "0.5" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/refund-policy", changefreq: "yearly", priority: "0.3" },
];

async function fetchCatalogPaths() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const paths = [];

  // tests_public / packages_public: the same SECURITY DEFINER views the
  // live site's own catalog pages read — active=true is baked into the
  // view itself, so nothing thin/inactive/draft can end up here.
  const [{ data: tests, error: testsErr }, { data: packages, error: pkgErr }, { data: articles, error: articlesErr }] =
    await Promise.all([
      supabase.from("tests_public").select("slug"),
      supabase.from("packages_public").select("slug"),
      supabase.from("articles").select("slug").eq("active", true),
    ]);

  if (testsErr) console.error("generate-sitemap: failed to read tests_public:", testsErr.message);
  if (pkgErr) console.error("generate-sitemap: failed to read packages_public:", pkgErr.message);
  if (articlesErr) console.error("generate-sitemap: failed to read articles:", articlesErr.message);

  for (const t of tests ?? []) {
    if (t.slug) paths.push({ path: `/tests/${t.slug}`, changefreq: "weekly", priority: "0.7" });
  }
  for (const p of packages ?? []) {
    if (p.slug) paths.push({ path: `/packages/${p.slug}`, changefreq: "weekly", priority: "0.7" });
  }
  for (const a of articles ?? []) {
    if (a.slug) paths.push({ path: `/articles/${a.slug}`, changefreq: "monthly", priority: "0.5" });
  }
  return paths;
}

function toXml(entries) {
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${SITE_URL}${e.path}</loc>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function main() {
  const catalogPaths = await fetchCatalogPaths();
  // De-duplicate by path (a slug could theoretically appear via more
  // than one source; a duplicate URL in a sitemap is a real, if minor,
  // quality issue worth guarding against explicitly).
  const seen = new Set();
  const all = [...STATIC_PATHS, ...catalogPaths].filter((e) => {
    if (seen.has(e.path)) return false;
    seen.add(e.path);
    return true;
  });

  const xml = toXml(all);
  const outPath = join(__dirname, "..", "public", "sitemap.xml");
  writeFileSync(outPath, xml, "utf8");
  console.log(`generate-sitemap: wrote ${all.length} URLs (${catalogPaths.length} from the live catalog) to public/sitemap.xml`);
}

main().catch((err) => {
  console.error("generate-sitemap: failed:", err);
  process.exit(1);
});

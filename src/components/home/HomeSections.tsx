import { Link } from "react-router-dom";
import CategoryIcon from "@/components/common/CategoryIcon";
import { formatCurrencyInr } from "@/services/pricingService";
import type { TestCategory, DiagnosticTest } from "@/types/test";
import type { Article } from "@/types/content";

// ---------- Shop by health concern ----------

// testCategories holds two different kinds of row: service/modality
// entries ("Blood Tests", "X-Ray", "Doctor Consult") and symptom or
// condition entries ("Fever", "Thyroid", "Liver Health"). There is no
// field on the document separating them, and inventing one would mean
// a schema change plus a migration of live data — so the split is made
// here, by slug, and it degrades safely: a project whose categories
// match none of these simply shows them all as quick categories and no
// concern grid, exactly as before.
const CONCERN_SLUGS = [
  "fever",
  "diabetes",
  "thyroid",
  "pcos",
  "pcod",
  "vitamin",
  "heart",
  "kidney",
  "liver",
  "obesity",
  "allergy",
  "anemia",
  "anaemia",
  "arthritis",
  "hair",
  "skin",
  "bone",
  "immunity",
  "infertility",
  "stress",
];

export function isHealthConcern(category: TestCategory): boolean {
  const slug = category.slug.toLowerCase();
  return CONCERN_SLUGS.some((s) => slug.includes(s));
}

export function HealthConcernGrid({ categories }: { categories: TestCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <section>
      <h2 className="mh-section-title">Shop by Health Concern</h2>
      <div className="mh-concern-grid">
        {categories.map((c) => (
          <Link key={c.id} to={`/tests?category=${c.id}`} className="mh-concern">
            <span className="mh-concern__icon">
              <CategoryIcon iconName={c.icon} size={26} color="var(--color-primary)" fallback="favorite" />
            </span>
            <span className="mh-concern__label">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------- Care for every family member ----------

// Fixed entry points into the catalogue, matched to a category by slug
// so each card only appears when that category actually exists.
interface FamilyCard {
  slugs: string[];
  label: string;
  icon: string;
  tint: string;
}

const FAMILY_CARDS: FamilyCard[] = [
  { slugs: ["women", "womens-health", "women-health"], label: "Women's Care", icon: "female", tint: "is-pink" },
  { slugs: ["men", "mens-health", "men-health"], label: "Men's Care", icon: "male", tint: "is-blue" },
  { slugs: ["senior", "senior-citizen", "elderly"], label: "Elderly Care", icon: "elderly", tint: "is-peach" },
  { slugs: ["child", "children", "paediatric", "pediatric"], label: "Child Care", icon: "child_care", tint: "is-mint" },
];

export function FamilyCareRow({ categories }: { categories: TestCategory[] }) {
  const cards = FAMILY_CARDS.map((card) => {
    const match = categories.find((c) => card.slugs.some((s) => c.slug === s || c.slug.includes(s)));
    return match ? { ...card, categoryId: match.id } : null;
  }).filter((c): c is FamilyCard & { categoryId: string } => c !== null);

  if (cards.length === 0) return null;

  return (
    <section>
      <h2 className="mh-section-title">Care for Every Family Member</h2>
      <div className="mh-hscroll" role="list">
        {cards.map((c) => (
          <Link key={c.label} role="listitem" to={`/tests?category=${c.categoryId}`} className="mh-family">
            <span className={`mh-family__icon ${c.tint}`}>
              <span className="mi mi-safe" style={{ fontSize: 24, width: 24, height: 24 }} aria-hidden="true">
                {c.icon}
              </span>
            </span>
            <span className="mh-family__label">{c.label}</span>
            <span className="mh-family__link">Explore packages →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------- Radiology ----------

// Imaging is sold per-scan rather than per-package, so this row lists
// the cheapest real test under each imaging category.
export function RadiologyRow({ categories, tests }: { categories: TestCategory[]; tests: DiagnosticTest[] }) {
  const imaging = tests.filter((t) => t.sampleType === "Imaging" || t.sampleType === "Cardiac");
  if (imaging.length === 0) return null;

  const byName = new Map<string, DiagnosticTest>();
  for (const t of imaging) {
    const existing = byName.get(t.name);
    if (!existing || t.sellingPrice < existing.sellingPrice) byName.set(t.name, t);
  }

  return (
    <section>
      <h2 className="mh-section-title">Radiology</h2>
      <p className="mh-section-subtitle">Scans &amp; imaging at partner centers</p>
      <div className="mh-hscroll" role="list">
        {[...byName.values()].map((t) => (
          <article key={t.id} role="listitem" className="mh-radiology">
            <h3 className="mh-radiology__name">{t.name}</h3>
            <p className="mh-radiology__mode">
              {t.homeCollection && t.centerCollection ? "Home & Center" : t.homeCollection ? "Home collection" : "Center visit"}
            </p>
            <p className="mh-radiology__price">Starting @ {formatCurrencyInr(t.sellingPrice)}</p>
            <Link className="mh-radiology__cta" to={`/tests/${t.slug}`}>
              Book Now
            </Link>
          </article>
        ))}
      </div>
      {categories.length === 0 && null}
    </section>
  );
}

// ---------- Compare labs promo ----------

export function CompareLabsPromo({ labCount }: { labCount: number }) {
  return (
    <section>
      <div className="mh-promo">
        <h2 className="mh-promo__title">Compare Diagnostic Labs</h2>
        <p className="mh-promo__text">
          See price, rating &amp; report time across{labCount > 0 ? ` ${labCount}` : ""} trusted labs before you book.
        </p>
        <Link className="mh-promo__cta" to="/labs">
          Compare Now →
        </Link>
      </div>
    </section>
  );
}

// ---------- Healthcare at your doorstep ----------

const DOORSTEP_STEPS = [
  "Select test & slot",
  "Phlebotomist visits",
  "Sample collected safely",
  "Report delivered digitally",
];

export function DoorstepSteps() {
  return (
    <section>
      <div className="mh-doorstep">
        <h2 className="mh-doorstep__title">Healthcare at Your Doorstep</h2>
        <p className="mh-doorstep__subtitle">Home sample collection in 4 simple steps</p>
        <ol className="mh-doorstep__steps">
          {DOORSTEP_STEPS.map((step, i) => (
            <li key={step}>
              <span className="mh-doorstep__num">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------- Why choose us ----------

const REASONS = [
  { icon: "apartment", title: "Multiple Partners", text: "Compare tests from multiple reputed labs." },
  { icon: "receipt_long", title: "Transparent Pricing", text: "See final pricing before you book." },
  { icon: "local_shipping", title: "Home Collection", text: "Doorstep sample pickup where available." },
  { icon: "verified", title: "Secure Reports", text: "Your diagnostic history, safely stored." },
];

export function WhyChooseUs({ businessName }: { businessName: string }) {
  return (
    <section>
      <h2 className="mh-section-title">Why Choose {businessName}?</h2>
      <div className="mh-reason-grid">
        {REASONS.map((r) => (
          <div key={r.title} className="mh-reason">
            <span className="mi mi-safe" style={{ fontSize: 24, width: 24, height: 24, color: "var(--color-primary)" }} aria-hidden="true">
              {r.icon}
            </span>
            <p className="mh-reason__title">{r.title}</p>
            <p className="mh-reason__text">{r.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Health insights ----------

// ~200 words per minute, rounded up, floored at 1 — computed from the
// article body already stored rather than a separate field an editor
// would have to keep accurate.
function readMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// The seed writes a plain `category` string while the type declares an
// optional `categoryId`; read whichever the document actually has.
function articleCategory(article: Article): string | null {
  const raw = (article as Article & { category?: unknown }).category ?? article.categoryId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function HealthInsights({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;
  return (
    <section>
      <h2 className="mh-section-title">Health Insights</h2>
      <p className="mh-section-subtitle">Reviewed content, not a substitute for medical advice</p>
      <div className="mh-hscroll" role="list">
        {articles.map((a) => {
          const category = articleCategory(a);
          return (
            <Link key={a.id} role="listitem" to={`/articles/${a.slug}`} className="mh-insight">
              {category && <span className="mh-insight__tag">{category}</span>}
              <h3 className="mh-insight__title">{a.title}</h3>
              <p className="mh-insight__meta">{readMinutes(a.body)} min read</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

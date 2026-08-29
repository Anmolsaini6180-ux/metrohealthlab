import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrencyInr } from "@/services/pricingService";
import type { HealthPackage } from "@/types/package";

interface Props {
  packages: HealthPackage[];
}

const ALL = "Popular";

// Percentage off, computed from the two prices already on the document
// rather than stored separately — so it can never drift out of step
// with an admin's price edit. Returns null when there is no real
// saving to advertise.
function discountPercent(pkg: HealthPackage): number | null {
  if (!pkg.mrp || pkg.mrp <= pkg.sellingPrice) return null;
  return Math.round(((pkg.mrp - pkg.sellingPrice) / pkg.mrp) * 100);
}

// Turnaround is stored as free text ("24 hours", "48 hours"). The card
// is narrow, so compact the common unit down to "24h" while leaving any
// other wording the admin typed untouched.
function shortTat(reportTat: string): string {
  return reportTat.replace(/(\d+)\s*hours?\b/i, "$1h").replace(/(\d+)\s*days?\b/i, "$1d");
}

export default function PackageShowcase({ packages }: Props) {
  // Chips come from the categories the packages actually have, so the
  // filter row can never offer a tab that matches nothing.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const p of packages) {
      if (p.category && !seen.includes(p.category)) seen.push(p.category);
    }
    return [ALL, ...seen];
  }, [packages]);

  const [filter, setFilter] = useState(ALL);

  const visible = useMemo(
    () => (filter === ALL ? packages : packages.filter((p) => p.category === filter)),
    [packages, filter]
  );

  if (packages.length === 0) return null;

  return (
    <section>
      <h2 className="mh-section-title">Popular Health Packages</h2>
      <p className="mh-section-subtitle">Curated by Metro Health</p>

      {categories.length > 1 && (
        <div className="mh-chip-row mh-hscroll" role="tablist" aria-label="Filter packages by category">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={filter === c}
              className={`mh-chip${filter === c ? " is-active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="mh-hscroll" role="list">
        {visible.map((p) => {
          const off = discountPercent(p);
          return (
            <article key={p.id} role="listitem" className="mh-pkg-card">
              <div className="mh-pkg-card__head">
                {p.tag && <span className="mh-pkg-card__tag">{p.tag}</span>}
                {typeof p.rating === "number" && (
                  <span className="mh-pkg-card__rating">
                    <span className="mi" aria-hidden="true">star</span>
                    {p.rating}
                  </span>
                )}
              </div>

              <h3 className="mh-pkg-card__name">{p.name}</h3>
              <p className="mh-pkg-card__count">
                {p.testIds.length} {p.testIds.length === 1 ? "Test" : "Tests"}
              </p>

              <p className="mh-pkg-card__prices">
                <span className="mh-pkg-card__price">{formatCurrencyInr(p.sellingPrice)}</span>
                {off !== null && (
                  <>
                    <s className="mh-pkg-card__mrp">{formatCurrencyInr(p.mrp)}</s>
                    <span className="mh-pkg-card__off">{off}% OFF</span>
                  </>
                )}
              </p>

              <p className="mh-pkg-card__meta">
                {p.homeCollection && (
                  <>
                    <span className="mi" aria-hidden="true">local_shipping</span> Home Collection
                    {p.reportTat ? " · " : ""}
                  </>
                )}
                {p.reportTat && (
                  <>
                    <span className="mi" aria-hidden="true">schedule</span> Report in {shortTat(p.reportTat)}
                  </>
                )}
              </p>

              <Link className="mh-pkg-card__cta" to={`/packages/${p.slug}`}>
                View Details
              </Link>
            </article>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
          No packages in {filter} yet.
        </p>
      )}
    </section>
  );
}

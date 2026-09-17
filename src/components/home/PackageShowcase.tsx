import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrencyInr } from "@/services/pricingService";
import { displayedTestCount } from "@/utils/packageDisplay";
import { useAsync } from "@/hooks/useAsync";
import { getAssignedMediaMap } from "@/services/mediaService";
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

  const packageIds = useMemo(() => packages.map((p) => p.id), [packages]);
  const images = useAsync(() => getAssignedMediaMap("packages", packageIds), [packageIds.join(",")]);

  const visible = useMemo(
    () => (filter === ALL ? packages : packages.filter((p) => p.category === filter)),
    [packages, filter]
  );

  if (packages.length === 0) return null;

  return (
    <section className="mh2-pkg-section">
      <div className="mh-section-head">
        <div>
          <h2 className="mh-section-title">Most Booked Health Checkups</h2>
          <p className="mh-section-subtitle">Curated by Metro Health Lab</p>
        </div>
        <Link to="/packages" className="mh-section-link">
          View all
        </Link>
      </div>

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

      <div className="mh2-pkg-rail" role="list">
        {visible.map((p) => {
          const off = discountPercent(p);
          const image = images.data?.get(p.id);
          return (
            <article key={p.id} role="listitem" className="mh2-pkg-card">
              <div className="mh2-pkg-card__media">
                {image ? (
                  <img className="mh2-pkg-card__image" src={image.secureUrl} alt="" loading="lazy" />
                ) : (
                  <div className="mh2-pkg-card__image-fallback" aria-hidden="true">
                    <span className="mi">inventory_2</span>
                  </div>
                )}
                {off !== null && <span className="mh2-pkg-card__badge">{off}% OFF</span>}
                {p.tag && <span className="mh2-pkg-card__tag">{p.tag}</span>}
              </div>

              <div className="mh2-pkg-card__body">
                <h3 className="mh2-pkg-card__name">{p.name}</h3>
                <p className="mh2-pkg-card__count">
                  {displayedTestCount(p)} {displayedTestCount(p) === 1 ? "Test" : "Tests"}
                  {typeof p.rating === "number" && (
                    <span className="mh2-pkg-card__rating">
                      <span className="mi" aria-hidden="true">star</span>
                      {p.rating}
                    </span>
                  )}
                </p>

                <p className="mh2-pkg-card__meta">
                  {p.homeCollection && (
                    <span>
                      <span className="mi" aria-hidden="true">local_shipping</span> Home Collection
                    </span>
                  )}
                  {p.reportTat && (
                    <span>
                      <span className="mi" aria-hidden="true">schedule</span> {shortTat(p.reportTat)}
                    </span>
                  )}
                </p>

                <div className="mh2-pkg-card__footer">
                  <p className="mh2-pkg-card__prices">
                    <span className="mh2-pkg-card__price">{formatCurrencyInr(p.sellingPrice)}</span>
                    {off !== null && <s className="mh2-pkg-card__mrp">{formatCurrencyInr(p.mrp)}</s>}
                  </p>
                  <Link className="mh2-btn mh2-btn--primary mh2-btn--sm" to={`/packages/${p.slug}`}>
                    Book Now
                  </Link>
                </div>
                <Link className="mh2-pkg-card__view-link" to={`/packages/${p.slug}`}>
                  View Details
                </Link>
              </div>
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

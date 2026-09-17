import { Link } from "react-router-dom";
import type { HealthPackage } from "@/types/package";
import { formatCurrencyInr } from "@/services/pricingService";
import { displayedTestCount } from "@/utils/packageDisplay";

// Turnaround is stored as free text ("24 hours", "48 hours"). Compact
// the common unit down to "24h" while leaving any other wording the
// admin typed untouched — same rule PackageShowcase always used, now
// shared so both places read a package's report time identically.
function shortTat(reportTat: string): string {
  return reportTat.replace(/(\d+)\s*hours?\b/i, "$1h").replace(/(\d+)\s*days?\b/i, "$1d");
}

function discountPercent(pkg: HealthPackage): number | null {
  if (!pkg.mrp || pkg.mrp <= pkg.sellingPrice) return null;
  return Math.round(((pkg.mrp - pkg.sellingPrice) / pkg.mrp) * 100);
}

/**
 * The one real package card — used on the homepage showcase and the
 * /packages listing. Previously two separate, drifting implementations
 * existed (this file's own old plain-text version, and a second one
 * inlined directly in PackageShowcase.tsx); this replaces both with a
 * single component so a future change to how a package is presented
 * only has one place to make it.
 *
 * `imageUrl` is resolved by the caller (getAssignedMediaMap/
 * getAssignedMedia against category "packages") rather than fetched
 * here, so a page rendering many cards can batch that lookup once
 * instead of once per card.
 */
export default function PackageCard({ pkg, imageUrl }: { pkg: HealthPackage; imageUrl?: string }) {
  const off = discountPercent(pkg);

  return (
    <article className="mh2-pkg-card" role="listitem">
      <div className="mh2-pkg-card__media">
        {imageUrl ? (
          <img className="mh2-pkg-card__image" src={imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="mh2-pkg-card__image-fallback" aria-hidden="true">
            <span className="mi">inventory_2</span>
          </div>
        )}
        {off !== null && <span className="mh2-pkg-card__badge">{off}% OFF</span>}
        {pkg.tag && <span className="mh2-pkg-card__tag">{pkg.tag}</span>}
      </div>

      <div className="mh2-pkg-card__body">
        <h3 className="mh2-pkg-card__name">{pkg.name}</h3>
        <p className="mh2-pkg-card__count">
          {displayedTestCount(pkg)} {displayedTestCount(pkg) === 1 ? "Test" : "Tests"}
          {typeof pkg.rating === "number" && (
            <span className="mh2-pkg-card__rating">
              <span className="mi" aria-hidden="true">star</span>
              {pkg.rating}
            </span>
          )}
        </p>

        <p className="mh2-pkg-card__meta">
          {pkg.homeCollection && (
            <span>
              <span className="mi" aria-hidden="true">local_shipping</span> Home Collection
            </span>
          )}
          {pkg.reportTat && (
            <span>
              <span className="mi" aria-hidden="true">schedule</span> {shortTat(pkg.reportTat)}
            </span>
          )}
        </p>

        <div className="mh2-pkg-card__footer">
          <p className="mh2-pkg-card__prices">
            <span className="mh2-pkg-card__price">{formatCurrencyInr(pkg.sellingPrice)}</span>
            {off !== null && <s className="mh2-pkg-card__mrp">{formatCurrencyInr(pkg.mrp)}</s>}
          </p>
          <Link className="mh2-btn mh2-btn--primary mh2-btn--sm" to={`/packages/${pkg.slug}`}>
            Book Now
          </Link>
        </div>
        <Link className="mh2-pkg-card__view-link" to={`/packages/${pkg.slug}`}>
          View Details
        </Link>
      </div>
    </article>
  );
}

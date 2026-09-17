import { Link } from "react-router-dom";
import type { DiagnosticTest, TestCategory } from "@/types/test";
import { formatCurrencyInr } from "@/services/pricingService";
import CategoryIcon from "./CategoryIcon";

interface Props {
  test: DiagnosticTest;
  /** Looked up by the caller so this stays a pure render — the same
   * category list already loaded for the filter chips. */
  category?: TestCategory;
}

function shortTat(reportTat: string): string {
  return reportTat.replace(/(\d+)\s*hours?\b/i, "$1h").replace(/(\d+)\s*days?\b/i, "$1d");
}

/**
 * Design system v2 test card — icon-forward (no photo asset exists for
 * individual tests, unlike packages), matching the same visual density
 * and two-action (Book Now / View Details) pattern as PackageCard so a
 * grid mixing both reads as one consistent system. Replaces the
 * previous single-link horizontal row.
 */
export default function TestCard({ test, category }: Props) {
  const hasDiscount = test.mrp > test.sellingPrice;
  const off = hasDiscount ? Math.round(((test.mrp - test.sellingPrice) / test.mrp) * 100) : null;

  return (
    <article className="mh2-test-card" role="listitem">
      <div className="mh2-test-card__media">
        <CategoryIcon iconName={category?.icon} size={28} color="var(--color-primary)" fallback="science" />
        {off !== null && <span className="mh2-pkg-card__badge">{off}% OFF</span>}
      </div>

      <div className="mh2-pkg-card__body">
        <h3 className="mh2-pkg-card__name">{test.name}</h3>
        <p className="mh2-pkg-card__count">{category?.name ?? test.sampleType}</p>

        <p className="mh2-pkg-card__meta">
          {test.fastingRequired && (
            <span>
              <span className="mi" aria-hidden="true">no_food</span> Fasting required
            </span>
          )}
          {test.homeCollection && (
            <span>
              <span className="mi" aria-hidden="true">local_shipping</span> Home Collection
            </span>
          )}
          {test.reportTat && (
            <span>
              <span className="mi" aria-hidden="true">schedule</span> {shortTat(test.reportTat)}
            </span>
          )}
        </p>

        <div className="mh2-pkg-card__footer">
          <p className="mh2-pkg-card__prices">
            <span className="mh2-pkg-card__price">{formatCurrencyInr(test.sellingPrice)}</span>
            {hasDiscount && <s className="mh2-pkg-card__mrp">{formatCurrencyInr(test.mrp)}</s>}
          </p>
          <Link className="mh2-btn mh2-btn--primary mh2-btn--sm" to={`/tests/${test.slug}`}>
            Book Now
          </Link>
        </div>
        <Link className="mh2-pkg-card__view-link" to={`/tests/${test.slug}`}>
          View Details
        </Link>
      </div>
    </article>
  );
}

import { Link } from "react-router-dom";
import type { DiagnosticTest } from "@/types/test";
import type { TestCategory } from "@/types/test";
import { formatCurrencyInr } from "@/services/pricingService";
import CategoryIcon from "./CategoryIcon";

interface Props {
  test: DiagnosticTest;
  /** Looked up by the caller so this stays a pure render — the same
   * category list already loaded for the filter chips. */
  category?: TestCategory;
}

// A single row in the "All Tests" list, matching the reference's
// icon-led layout: category icon, name, sample-type/fasting subtitle,
// and price aligned right. Links straight to the test's own detail
// page rather than an "Add to cart" action — this product has no cart,
// only a single-item booking flow (see TestDetailPage), so a fake Add
// button that silently guesses a lab price would be exactly the kind
// of non-functional control this redesign is not allowed to ship.
export default function TestCard({ test, category }: Props) {
  const hasDiscount = test.mrp > test.sellingPrice;

  return (
    <Link to={`/tests/${test.slug}`} className="mh-test-row">
      <span className="mh-test-row__icon" aria-hidden="true">
        <CategoryIcon iconName={category?.icon} size={22} color="var(--color-primary)" fallback="science" />
      </span>

      <span className="mh-test-row__body">
        <span className="mh-test-row__name">{test.name}</span>
        <span className="mh-test-row__meta">
          {category?.name ?? test.sampleType}
          {test.fastingRequired ? " • Fasting required" : ""}
        </span>
      </span>

      <span className="mh-test-row__price">
        <span className="mh-test-row__lead">Starting from</span>
        <span className="mh-test-row__amount">{formatCurrencyInr(test.sellingPrice)}</span>
        {hasDiscount && <span className="mh-test-row__mrp">{formatCurrencyInr(test.mrp)}</span>}
      </span>

      <span className="mh-test-row__go" aria-hidden="true">
        <span className="mi">chevron_right</span>
      </span>
    </Link>
  );
}

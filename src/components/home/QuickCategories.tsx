import { Link } from "react-router-dom";
import CategoryIcon from "@/components/common/CategoryIcon";
import { formatCurrencyInr } from "@/services/pricingService";
import { useAsync } from "@/hooks/useAsync";
import { getAssignedMediaMap } from "@/services/mediaService";
import type { TestCategory } from "@/types/test";
import type { DiagnosticTest } from "@/types/test";

interface Props {
  categories: TestCategory[];
  tests: DiagnosticTest[];
}

// The support line under each category name is real data, never
// invented: the admin's own `subtitle` when one is written (that is
// what the field is for — "Up to 70% OFF"), otherwise "From ₹x"
// derived from the cheapest active test actually in that category. A
// category with neither simply shows no second line.
function supportLineFor(category: TestCategory, tests: DiagnosticTest[]): string | null {
  if (category.subtitle?.trim()) return category.subtitle.trim();

  const prices = tests.filter((t) => t.categoryId === category.id).map((t) => t.sellingPrice);
  if (prices.length === 0) return null;
  return `From ${formatCurrencyInr(Math.min(...prices))}`;
}

// Rotating tints so consecutive cards read as distinct panels rather
// than one long stripe. Admins control copy and icon, never colour —
// that is what keeps the rail on-brand as the catalogue grows.
const TINTS = ["is-blue", "is-peach", "is-mint"] as const;

export default function QuickCategories({ categories, tests }: Props) {
  // A category's own real photo, assigned from Admin -> Categories ->
  // Choose Image (media_assets, category "tests", relatedId = this
  // category's own id — see mediaService.ts's ImagePicker workflow).
  // Every category starts with none assigned: the icon+tint treatment
  // below is the honest fallback, not a placeholder pretending to be a
  // photo, until an admin actually picks one for that specific row.
  const categoryIds = categories.map((c) => c.id);
  const images = useAsync(() => getAssignedMediaMap("tests", categoryIds), [categoryIds.join(",")]);

  if (categories.length === 0) return null;

  return (
    <section className="mh-cats">
      <div className="mh-section-head">
        <h2 className="mh-section-title">Explore Top Categories</h2>
        <Link to="/tests" className="mh-section-link">
          View all
        </Link>
      </div>

      <div className="mh-cats__rail" role="list">
        {categories.map((c, i) => {
          const support = supportLineFor(c, tests);
          const image = images.data?.get(c.id);
          return (
            <Link
              key={c.id}
              role="listitem"
              to={`/tests?category=${c.id}`}
              className={`mh-cat-card ${TINTS[i % TINTS.length]}${image ? " has-image" : ""}`}
            >
              {image ? (
                <img className="mh-cat-card__image" src={image.secureUrl} alt="" loading="lazy" />
              ) : (
                <span className="mh-cat-card__icon">
                  <CategoryIcon iconName={c.icon} size={28} color="currentColor" fallback="science" />
                </span>
              )}
              <span className="mh-cat-card__title">{c.name}</span>
              {support && <span className="mh-cat-card__support">{support}</span>}
              <span className="mh-cat-card__go" aria-hidden="true">
                <span className="mi">arrow_forward</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

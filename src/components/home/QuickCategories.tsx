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

export default function QuickCategories({ categories, tests }: Props) {
  // A category's own real photo, assigned from Admin -> Categories ->
  // Choose Image (media_assets, category "tests", relatedId = this
  // category's own id — see mediaService.ts's ImagePicker workflow).
  // Every category starts with none assigned: the icon fallback below
  // is the honest treatment, not a placeholder pretending to be a
  // photo, until an admin actually picks one for that specific row.
  const categoryIds = categories.map((c) => c.id);
  const images = useAsync(() => getAssignedMediaMap("tests", categoryIds), [categoryIds.join(",")]);

  if (categories.length === 0) return null;

  return (
    <section className="mh2-cats">
      <div className="mh-section-head">
        <h2 className="mh-section-title">Shop by Category</h2>
        <Link to="/tests" className="mh-section-link">
          View all
        </Link>
      </div>

      <div className="mh2-cats__rail" role="list">
        {categories.map((c) => {
          const support = supportLineFor(c, tests);
          const image = images.data?.get(c.id);
          return (
            <Link key={c.id} role="listitem" to={`/tests?category=${c.id}`} className="mh2-cat-card">
              <span className="mh2-cat-card__circle">
                {image ? (
                  <img className="mh2-cat-card__image" src={image.secureUrl} alt="" loading="lazy" />
                ) : (
                  <CategoryIcon iconName={c.icon} size={26} color="var(--color-primary)" fallback="science" />
                )}
              </span>
              <span className="mh2-cat-card__title">{c.name}</span>
              {support && <span className="mh2-cat-card__support">{support}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import CategoryIcon from "@/components/common/CategoryIcon";
import { formatCurrencyInr } from "@/services/pricingService";
import type { TestCategory } from "@/types/test";
import type { DiagnosticTest } from "@/types/test";

interface Props {
  categories: TestCategory[];
  tests: DiagnosticTest[];
}

// Horizontally scrolling shortcut row at the top of the home page.
//
// The price line under each name is real data, never invented: it uses
// the category's own `subtitle` when an admin has written one (that is
// what the field is for — "Up to 70% OFF"), and otherwise derives
// "From ₹x" from the cheapest active test actually in that category.
// A category with neither simply shows no second line.
function priceLineFor(category: TestCategory, tests: DiagnosticTest[]): string | null {
  if (category.subtitle?.trim()) return category.subtitle.trim();

  const prices = tests.filter((t) => t.categoryId === category.id).map((t) => t.sellingPrice);
  if (prices.length === 0) return null;
  return `From ${formatCurrencyInr(Math.min(...prices))}`;
}

export default function QuickCategories({ categories, tests }: Props) {
  if (categories.length === 0) return null;

  return (
    <section>
      <h2 className="mh-section-title">Quick Categories</h2>
      <div className="mh-hscroll" role="list">
        {categories.map((c) => {
          const price = priceLineFor(c, tests);
          return (
            <Link key={c.id} role="listitem" to={`/tests?category=${c.id}`} className="mh-quickcat">
              <span className="mh-quickcat__icon">
                <CategoryIcon iconName={c.icon} size={26} color="var(--color-primary)" fallback="science" />
              </span>
              <span className="mh-quickcat__title">{c.name}</span>
              {price && <span className="mh-quickcat__price">{price}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

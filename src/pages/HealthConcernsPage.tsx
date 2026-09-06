import { Link } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToTestCategories } from "@/services/testService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import CategoryIcon from "@/components/common/CategoryIcon";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema } from "@/utils/seoSchema";

// Health concerns are modeled as an alternate entry point into the same
// testCategories collection (e.g. "Diabetes", "Thyroid", "Heart Health")
// rather than a separate hard-coded list — add/curate these categories
// from the Admin panel.
export default function HealthConcernsPage() {
  const categories = useRealtimeQuery(subscribeToTestCategories, []);

  return (
    <div>
      <Seo
        title="Shop by Health Concern"
        description="Find the right diagnostic tests for specific health concerns — diabetes, thyroid, heart health, and more — from Metro Health Lab."
        path="/health-concerns"
        jsonLd={buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Health Concerns", path: "/health-concerns" }])}
      />
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Shop by health concern</h1>
      {categories.loading && <LoadingState rows={3} />}
      {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
      {categories.data && categories.data.length === 0 && (
        <EmptyState icon="favorite" title="No health concerns configured yet" />
      )}
      {categories.data && categories.data.length > 0 && (
        <div className="card-grid">
          {categories.data.map((c) => (
            <Link
              key={c.id}
              to={`/tests?category=${c.id}`}
              className="card"
              style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}
            >
              <CategoryIcon iconName={c.icon} size={26} color="var(--color-primary)" fallback="favorite" />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600 }}>{c.name}</p>
                {c.subtitle && (
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{c.subtitle}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

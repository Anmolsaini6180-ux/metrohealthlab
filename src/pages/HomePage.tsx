import { Link } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToBanners } from "@/services/contentService";
import { subscribeToTestCategories, subscribeToTests } from "@/services/testService";
import { subscribeToPackages } from "@/services/packageService";
import { subscribeToActiveLabs } from "@/services/labService";
import LoadingState from "@/components/common/LoadingState";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import TestCard from "@/components/common/TestCard";
import PackageCard from "@/components/common/PackageCard";

export default function HomePage() {
  const banners = useRealtimeQuery(subscribeToBanners, []);
  const categories = useRealtimeQuery(subscribeToTestCategories, []);
  const featuredTests = useRealtimeQuery<import("@/types/test").DiagnosticTest[]>(
    (cb, err) => subscribeToTests({ max: 8 }, cb, err),
    []
  );
  const featuredPackages = useRealtimeQuery<import("@/types/package").HealthPackage[]>(
    (cb, err) => subscribeToPackages(undefined, cb, err),
    []
  );
  const labs = useRealtimeQuery(subscribeToActiveLabs, []);

  return (
    <div style={{ display: "grid", gap: "var(--space-xl)" }}>
      <section>
        {banners.loading && <LoadingState rows={1} label="Loading offers..." />}
        {banners.error && <ErrorState message={banners.error} onRetry={banners.retry} />}
        {banners.data && banners.data.length === 0 && (
          <EmptyState icon="local_offer" title="No current offers" />
        )}
        {banners.data && banners.data.length > 0 && (
          <div className="card-grid">
            {banners.data.map((b) => (
              <div key={b.id} className="card" style={{ background: "var(--color-bg-tint)" }}>
                <p style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{b.title}</p>
                {b.subtitle && <p className="text-soft">{b.subtitle}</p>}
                {b.ctaLabel && b.ctaLink && (
                  <Link className="btn btn-accent" style={{ marginTop: "var(--space-sm)" }} to={b.ctaLink}>
                    {b.ctaLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Browse by category</h2>
        {categories.loading && <LoadingState rows={2} />}
        {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
        {categories.data && categories.data.length === 0 && (
          <EmptyState icon="category" title="No categories yet" description="Add testCategories in Firestore to populate this section." />
        )}
        {categories.data && categories.data.length > 0 && (
          <div className="card-grid">
            {categories.data.map((c) => (
              <Link key={c.id} to={`/tests?category=${c.id}`} className="card" style={{ textAlign: "center" }}>
                <span className="mi" style={{ fontSize: 28, color: "var(--color-primary)" }}>
                  {c.icon ?? "science"}
                </span>
                <p style={{ marginTop: 6, fontWeight: 600, fontSize: "var(--text-sm)" }}>{c.name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
          <h2 style={{ fontSize: "var(--text-xl)" }}>Popular tests</h2>
          <Link to="/tests" className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            View all
          </Link>
        </div>
        {featuredTests.loading && <CardGridSkeleton count={4} variant="test" />}
        {featuredTests.error && <ErrorState message={featuredTests.error} onRetry={featuredTests.retry} />}
        {featuredTests.data && featuredTests.data.length === 0 && (
          <EmptyState icon="science" title="No tests available yet" description="Add documents to the tests collection in Firestore." />
        )}
        {featuredTests.data && featuredTests.data.length > 0 && (
          <div className="card-grid">
            {featuredTests.data.map((t) => (
              <TestCard key={t.id} test={t} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
          <h2 style={{ fontSize: "var(--text-xl)" }}>Health packages</h2>
          <Link to="/packages" className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            View all
          </Link>
        </div>
        {featuredPackages.loading && <CardGridSkeleton count={3} variant="package" />}
        {featuredPackages.error && <ErrorState message={featuredPackages.error} onRetry={featuredPackages.retry} />}
        {featuredPackages.data && featuredPackages.data.length === 0 && (
          <EmptyState icon="inventory_2" title="No packages available yet" />
        )}
        {featuredPackages.data && featuredPackages.data.length > 0 && (
          <div className="card-grid">
            {featuredPackages.data.slice(0, 6).map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
          <h2 style={{ fontSize: "var(--text-xl)" }}>Trusted labs</h2>
          <Link to="/labs" className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Compare labs
          </Link>
        </div>
        {labs.loading && <LoadingState rows={2} />}
        {labs.error && <ErrorState message={labs.error} onRetry={labs.retry} />}
        {labs.data && labs.data.length > 0 && (
          <div className="card-grid">
            {labs.data.slice(0, 4).map((lab) => (
              <div key={lab.id} className="card">
                <p style={{ fontWeight: 600 }}>{lab.name}</p>
                {lab.description && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{lab.description}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

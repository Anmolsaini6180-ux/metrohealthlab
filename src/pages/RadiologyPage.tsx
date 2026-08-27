import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToTestCategories, subscribeToTestsByCategoryIds } from "@/services/testService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import TestCard from "@/components/common/TestCard";

const RADIOLOGY_CATEGORY_SLUGS = ["xray", "mri", "ct", "usg"];

export default function RadiologyPage() {
  const categories = useRealtimeQuery(subscribeToTestCategories, []);
  const radiologyCategoryIds = (categories.data ?? [])
    .filter((c) => RADIOLOGY_CATEGORY_SLUGS.includes(c.slug))
    .map((c) => c.id);

  // One realtime query across all matched category IDs (Firestore's
  // `in` operator) instead of a separate listener per category.
  const tests = useRealtimeQuery<import("@/types/test").DiagnosticTest[]>(
    (cb, err) => subscribeToTestsByCategoryIds(radiologyCategoryIds, cb, err),
    [radiologyCategoryIds.join(",")]
  );

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Radiology & imaging</h1>
      {(categories.loading || tests.loading) && <LoadingState rows={3} />}
      {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
      {tests.error && <ErrorState message={tests.error} onRetry={tests.retry} />}
      {tests.data && tests.data.length === 0 && !tests.loading && (
        <EmptyState
          icon="monitor_heart"
          title="No radiology tests yet"
          description="Add tests with categoryId matching an xray/mri/ct/usg testCategory."
        />
      )}
      {tests.data && tests.data.length > 0 && (
        <div className="card-grid">
          {tests.data.map((t) => (
            <TestCard key={t.id} test={t} />
          ))}
        </div>
      )}
    </div>
  );
}

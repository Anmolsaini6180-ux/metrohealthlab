import { useSearchParams } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { searchTests, subscribeToTestCategories, subscribeToTests } from "@/services/testService";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import TestCard from "@/components/common/TestCard";

export default function TestsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoryId = params.get("category") ?? undefined;

  const categories = useRealtimeQuery(subscribeToTestCategories, []);
  // Browsing by category is realtime; searching is a one-time lookup
  // (client-side filter — see searchTests) wrapped in the same hook so
  // there's never a redundant live listener running alongside it.
  const tests = useRealtimeQuery<import("@/types/test").DiagnosticTest[]>(
    (onData, onError) => {
      if (q) {
        searchTests(q).then(onData).catch(onError);
        return () => {};
      }
      return subscribeToTests({ categoryId }, onData, onError);
    },
    [q, categoryId]
  );

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>
        {q ? `Results for "${q}"` : "Diagnostic tests"}
      </h1>

      {categories.data && categories.data.length > 0 && (
        <div
          className="mh-scroll"
          style={{ display: "flex", gap: "var(--space-sm)", overflowX: "auto", marginBottom: "var(--space-md)" }}
        >
          <button
            className={categoryId ? "btn btn-outline" : "btn btn-primary"}
            onClick={() => setParams(q ? { q } : {})}
          >
            All
          </button>
          {categories.data.map((c) => (
            <button
              key={c.id}
              className={categoryId === c.id ? "btn btn-primary" : "btn btn-outline"}
              onClick={() => setParams({ category: c.id })}
              style={{ whiteSpace: "nowrap" }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {tests.loading && <CardGridSkeleton count={6} variant="test" />}
      {tests.error && <ErrorState message={tests.error} onRetry={tests.retry} />}
      {tests.data && tests.data.length === 0 && (
        <EmptyState icon="search_off" title="No tests found" description="Try a different search or category." />
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

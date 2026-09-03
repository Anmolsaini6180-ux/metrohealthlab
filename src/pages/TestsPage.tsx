import { useSearchParams } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { searchTests, subscribeToTestCategories, subscribeToTests } from "@/services/testService";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import TestCard from "@/components/common/TestCard";
import type { DiagnosticTest } from "@/types/test";

export default function TestsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoryId = params.get("category") ?? undefined;

  const categories = useRealtimeQuery(subscribeToTestCategories, []);
  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));

  // Browsing by category is realtime; searching is a one-time lookup
  // (client-side filter — see searchTests) wrapped in the same hook so
  // there's never a redundant live listener running alongside it.
  const tests = useRealtimeQuery<DiagnosticTest[]>(
    (onData, onError) => {
      if (q) {
        searchTests(q).then(onData).catch(onError);
        return () => {};
      }
      return subscribeToTests({ categoryId }, onData, onError);
    },
    [q, categoryId]
  );

  const activeCategory = categoryId ? categoryById.get(categoryId) : undefined;

  return (
    <div className="mh-alltests">
      <aside className="mh-alltests__sidebar">
        <h2 className="mh-alltests__sidebar-title">Categories</h2>
        <nav className="mh-alltests__cat-list" aria-label="Filter by category">
          <button
            className={!categoryId ? "is-active" : undefined}
            onClick={() => setParams(q ? { q } : {})}
          >
            All Tests
          </button>
          {(categories.data ?? []).map((c) => (
            <button
              key={c.id}
              className={categoryId === c.id ? "is-active" : undefined}
              onClick={() => setParams({ category: c.id })}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </aside>

      <div className="mh-alltests__main">
        <div className="mh-alltests__head">
          <h1 style={{ fontSize: "var(--text-xl)" }}>
            {q ? `Results for "${q}"` : activeCategory ? activeCategory.name : "All Tests"}
          </h1>
          {tests.data && <span className="text-soft mh-alltests__count">{tests.data.length} tests</span>}
        </div>

        {/* Mobile-only chip row — the sidebar above is desktop-only via CSS */}
        {categories.data && categories.data.length > 0 && (
          <div className="mh-chip-row mh-hscroll mh-alltests__mobile-chips" role="tablist" aria-label="Filter by category">
            <button
              role="tab"
              aria-selected={!categoryId}
              className={`mh-chip${!categoryId ? " is-active" : ""}`}
              onClick={() => setParams(q ? { q } : {})}
            >
              All
            </button>
            {categories.data.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={categoryId === c.id}
                className={`mh-chip${categoryId === c.id ? " is-active" : ""}`}
                onClick={() => setParams({ category: c.id })}
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
          <div className="mh-test-list">
            {tests.data.map((t) => (
              <TestCard key={t.id} test={t} category={categoryById.get(t.categoryId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

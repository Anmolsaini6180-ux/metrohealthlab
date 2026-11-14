import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { searchTests, subscribeToTestCategories, subscribeToTests } from "@/services/testService";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import TestCard from "@/components/common/TestCard";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema } from "@/utils/seoSchema";
import type { DiagnosticTest } from "@/types/test";

type SortKey = "relevance" | "price-asc" | "price-desc" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Relevance",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  name: "Name: A to Z",
};

function sortTests(tests: DiagnosticTest[], sort: SortKey): DiagnosticTest[] {
  if (sort === "relevance") return tests;
  const sorted = [...tests];
  if (sort === "price-asc") sorted.sort((a, b) => a.sellingPrice - b.sellingPrice);
  else if (sort === "price-desc") sorted.sort((a, b) => b.sellingPrice - a.sellingPrice);
  else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export default function TestsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoryId = params.get("category") ?? undefined;
  const [sort, setSort] = useState<SortKey>("relevance");

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

  const sorted = useMemo(() => sortTests(tests.data ?? [], sort), [tests.data, sort]);
  const activeCategory = categoryId ? categoryById.get(categoryId) : undefined;

  return (
    <div className="mh2-alltests">
      <Seo
        title={activeCategory ? `${activeCategory.name} — Book Diagnostic Tests` : "Diagnostic Tests — Book Online"}
        description={
          activeCategory
            ? `Browse and book ${activeCategory.name.toLowerCase()} with home sample collection from Metro Health Lab.`
            : "Browse Metro Health Lab's full range of diagnostic tests. Compare prices, check preparation requirements, and book with home sample collection."
        }
        // Canonicalizes every ?q=/?category= variation back to the
        // plain listing — a search-term or category filter is the
        // same underlying page/content, not a distinct page worth its
        // own indexed URL (the classic SPA index-bloat trap: without
        // this, Google could crawl and index unlimited /tests?q=<junk>
        // permutations as separate thin pages).
        path="/tests"
        // A search-results view is thin/duplicate by nature — never
        // indexed, regardless of what was searched for.
        index={!q}
        jsonLd={buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Tests", path: "/tests" }])}
      />
      <aside className="mh2-alltests__sidebar">
        <h2 className="mh2-alltests__sidebar-title">Categories</h2>
        <nav className="mh2-alltests__cat-list" aria-label="Filter by category">
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

      <div>
        <div className="mh2-listing__head">
          <div>
            <h1 className="mh2-listing__title">
              {q ? `Results for "${q}"` : activeCategory ? activeCategory.name : "All Tests"}
            </h1>
            {tests.data && <p className="mh2-listing__count">{sorted.length} test{sorted.length === 1 ? "" : "s"}</p>}
          </div>
          {sorted.length > 1 && (
            <label className="mh2-listing__sort">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Mobile-only chip row — the sidebar above is desktop-only via CSS */}
        {categories.data && categories.data.length > 0 && (
          <div className="mh-chip-row mh-hscroll mh2-alltests__mobile-chips" role="tablist" aria-label="Filter by category">
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
        {tests.data && sorted.length === 0 && (
          <EmptyState icon="search_off" title="No tests found" description="Try a different search or category." />
        )}
        {sorted.length > 0 && (
          <div className="mh2-test-grid" role="list">
            {sorted.map((t) => (
              <TestCard key={t.id} test={t} category={categoryById.get(t.categoryId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

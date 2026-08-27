import { Link } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToArticles } from "@/services/contentService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function ArticlesPage() {
  const articles = useRealtimeQuery<import("@/types/content").Article[]>(
    (cb, err) => subscribeToArticles(undefined, cb, err),
    []
  );

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Health articles</h1>
      {articles.loading && <LoadingState rows={3} />}
      {articles.error && <ErrorState message={articles.error} onRetry={articles.retry} />}
      {articles.data && articles.data.length === 0 && <EmptyState icon="article" title="No articles yet" />}
      {articles.data && articles.data.length > 0 && (
        <div className="card-grid">
          {articles.data.map((a) => (
            <Link key={a.id} to={`/articles/${a.slug}`} className="card">
              <p style={{ fontWeight: 600 }}>{a.title}</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>{a.excerpt}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

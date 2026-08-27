import { useParams } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToArticleBySlug } from "@/services/contentService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const article = useRealtimeQuery<import("@/types/content").Article | null>(
    (cb, err) => subscribeToArticleBySlug(slug!, cb, err),
    [slug]
  );

  if (article.loading) return <LoadingState label="Loading article..." />;
  if (article.error) return <ErrorState message={article.error} onRetry={article.retry} />;
  if (!article.data) return <EmptyState icon="search_off" title="Article not found" />;

  const a = article.data;
  return (
    <article style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>{a.title}</h1>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{a.body}</div>
    </article>
  );
}

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createArticle, getAllArticles, updateArticle } from "@/services/adminCatalogService";
import type { Article } from "@/types/content";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminArticlesPage() {
  const { user } = useAuth();
  const articles = useAsync(getAllArticles, []);
  const [editing, setEditing] = useState<Article | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(article: Article) {
    if (!user) return;
    await updateArticle(user.uid, article.id, { active: !article.active });
    articles.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Articles</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add article"}</button>
      </div>

      {showCreate && user && <ArticleForm actorUid={user.uid} onDone={() => { setShowCreate(false); articles.retry(); }} />}
      {editing && user && <ArticleForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); articles.retry(); }} />}

      {articles.loading && <LoadingState rows={3} />}
      {articles.error && <ErrorState message={articles.error} onRetry={articles.retry} />}
      {articles.data && articles.data.length === 0 && <EmptyState icon="article" title="No articles yet" />}
      {articles.data && articles.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {articles.data.map((a) => (
            <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{a.title} {!a.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(unpublished)</span>}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{a.excerpt}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(a)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(a)}>{a.active ? "Unpublish" : "Publish"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleForm({ actorUid, existing, onDone }: { actorUid: string; existing?: Article; onDone: () => void }) {
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    slug: existing?.slug ?? "",
    excerpt: existing?.excerpt ?? "",
    body: existing?.body ?? "",
    coverImage: existing?.coverImage ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateArticle(actorUid, existing.id, form);
      } else {
        await createArticle(actorUid, { ...form, active: true, publishedAt: new Date().toISOString() });
      }
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Title" required value={form.title} onChange={(e) => update("title", e.target.value)} />
      <input placeholder="Slug" required value={form.slug} onChange={(e) => update("slug", e.target.value)} />
      <input placeholder="Excerpt" required value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)} />
      <textarea placeholder="Body" rows={6} required value={form.body} onChange={(e) => update("body", e.target.value)} />
      <input placeholder="Cover image URL (optional)" value={form.coverImage} onChange={(e) => update("coverImage", e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : existing ? "Save changes" : "Publish article"}</button>
    </form>
  );
}

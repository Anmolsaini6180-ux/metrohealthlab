import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createTestCategory, getAllTestCategories, updateTestCategory } from "@/services/adminCatalogService";
import type { TestCategory } from "@/types/test";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminCategoriesPage() {
  const { user } = useAuth();
  const categories = useAsync(getAllTestCategories, []);
  const [showForm, setShowForm] = useState(false);

  async function handleToggleActive(cat: TestCategory) {
    if (!user) return;
    await updateTestCategory(user.uid, cat.id, { active: !cat.active });
    categories.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Categories</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add category"}
        </button>
      </div>

      {showForm && user && (
        <CategoryForm actorUid={user.uid} onDone={() => { setShowForm(false); categories.retry(); }} />
      )}

      {categories.loading && <LoadingState rows={3} />}
      {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
      {categories.data && categories.data.length === 0 && <EmptyState icon="category" title="No categories yet" />}
      {categories.data && categories.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {categories.data.map((c) => (
            <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontWeight: 600 }}>
                {c.name} {!c.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}
              </p>
              <button className="btn btn-outline" onClick={() => handleToggleActive(c)}>
                {c.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryForm({ actorUid, onDone }: { actorUid: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTestCategory(actorUid, { name, slug, icon: icon || undefined, active: true, displayOrder: 0 });
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Slug" required value={slug} onChange={(e) => setSlug(e.target.value)} />
      <input placeholder="Material icon name (optional, e.g. bloodtype)" value={icon} onChange={(e) => setIcon(e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : "Create category"}
      </button>
    </form>
  );
}

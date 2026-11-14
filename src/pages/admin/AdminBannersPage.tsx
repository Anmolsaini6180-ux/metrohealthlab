import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createBanner, getAllBanners, updateBanner } from "@/services/adminCatalogService";
import type { Banner } from "@/types/content";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import MediaUploader from "@/components/admin/MediaUploader";
import { toUserMessage } from "@/utils/errors";

export default function AdminBannersPage() {
  const { user } = useAuth();
  const banners = useAsync(getAllBanners, []);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleToggleActive(banner: Banner) {
    if (!user) return;
    await updateBanner(user.uid, banner.id, { active: !banner.active });
    banners.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Banners</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add banner"}</button>
      </div>

      {showCreate && user && <BannerForm actorUid={user.uid} onDone={() => { setShowCreate(false); banners.retry(); }} />}
      {editing && user && <BannerForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); banners.retry(); }} />}

      {banners.loading && <LoadingState rows={3} />}
      {banners.error && <ErrorState message={banners.error} onRetry={banners.retry} />}
      {banners.data && banners.data.length === 0 && <EmptyState icon="view_carousel" title="No banners yet" />}
      {banners.data && banners.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {banners.data.map((b) => (
            <div key={b.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{b.title} {!b.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{b.subtitle ?? ""}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEditing(b)}>Edit</button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(b)}>{b.active ? "Deactivate" : "Activate"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function BannerForm({ actorUid, existing, onDone }: { actorUid: string; existing?: Banner; onDone: () => void }) {
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    subtitle: existing?.subtitle ?? "",
    ctaLabel: existing?.ctaLabel ?? "",
    ctaLink: existing?.ctaLink ?? "",
    imageUrl: existing?.imageUrl ?? "",
    startAt: existing?.startAt ?? "",
    endAt: existing?.endAt ?? "",
    displayOrder: existing?.displayOrder ?? 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateBanner(actorUid, existing.id, form);
      } else {
        await createBanner(actorUid, { ...form, active: true });
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
      <input placeholder="Subtitle" value={form.subtitle} onChange={(e) => update("subtitle", e.target.value)} />
      <MediaUploader
        label="Banner image"
        category="banners"
        relatedId={existing?.id}
        value={form.imageUrl}
        hint="Wide image — shown across the top of the home page."
        onChange={(url) => update("imageUrl", url)}
        onClear={() => update("imageUrl", "")}
      />
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input placeholder="CTA text" value={form.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} style={{ flex: 1 }} />
        <input placeholder="CTA destination (e.g. /tests)" value={form.ctaLink} onChange={(e) => update("ctaLink", e.target.value)} style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input type="date" value={form.startAt} onChange={(e) => update("startAt", e.target.value)} style={{ flex: 1 }} />
        <input type="date" value={form.endAt} onChange={(e) => update("endAt", e.target.value)} style={{ flex: 1 }} />
      </div>
      <input type="number" placeholder="Display order" value={form.displayOrder} onChange={(e) => update("displayOrder", Number(e.target.value))} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : existing ? "Save changes" : "Create banner"}</button>
    </form>
  );
}

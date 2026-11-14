import { useMemo, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { deleteMedia, listMedia, updateMediaMetadata } from "@/services/mediaService";
import MediaUploader from "@/components/admin/MediaUploader";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import { MEDIA_CATEGORY_LABELS, type MediaAsset, type MediaCategory } from "@/types/media";

const CATEGORIES = Object.keys(MEDIA_CATEGORY_LABELS) as MediaCategory[];

// The "Content" tree from the upload-centre spec: Branding, Banners,
// Tests, Packages, Labs. Reports are deliberately NOT browsable here —
// they're health data with per-customer authorization and live on the
// Reports screen behind expiring download links.
export default function AdminMediaPage() {
  const [category, setCategory] = useState<MediaCategory>("branding");
  const assets = useAsync(() => listMedia(category), [category]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<MediaAsset | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = assets.data ?? [];
    if (!q) return rows;
    return rows.filter((a) => (a.title ?? a.filename ?? "").toLowerCase().includes(q) || (a.altText ?? "").toLowerCase().includes(q));
  }, [assets.data, search]);

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteMedia(id);
      assets.retry();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(asset: MediaAsset) {
    setBusyId(asset.id);
    setError(null);
    try {
      await updateMediaMetadata(asset.id, { active: !asset.active });
      assets.retry();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Couldn't copy to the clipboard — select the URL manually instead.");
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: 4 }}>Media library</h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        Everything uploaded from the admin panel, grouped by where it's used. Files live in
        Cloudinary; this page is the index. Deleting removes the file from Cloudinary as well, so
        check nothing still points at it first.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "var(--space-md)" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={c === category ? "btn btn-primary" : "btn btn-outline"}
            onClick={() => setCategory(c)}
          >
            {MEDIA_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: "var(--space-md)" }}>
        <MediaUploader
          label={`Add to ${MEDIA_CATEGORY_LABELS[category]}`}
          category={category}
          onChange={() => assets.retry()}
        />
      </div>

      <input
        type="search"
        placeholder="Search by title or alt text..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "var(--space-md)", maxWidth: 360 }}
      />

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      {assets.loading && <LoadingState rows={3} />}
      {assets.error && <ErrorState message={assets.error} onRetry={assets.retry} />}
      {assets.data && assets.data.length === 0 && (
        <EmptyState icon="image" title={`Nothing in ${MEDIA_CATEGORY_LABELS[category]} yet`} />
      )}
      {assets.data && assets.data.length > 0 && visible.length === 0 && (
        <EmptyState icon="search_off" title="No images match that search" />
      )}

      {visible.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {visible.map((a) => (
            <div key={a.id} className="card" style={{ display: "grid", gap: 8, opacity: a.active ? 1 : 0.55 }}>
              <img
                src={a.secureUrl}
                alt={a.altText ?? a.filename}
                style={{ width: "100%", height: 120, objectFit: "contain", background: "#fff", borderRadius: "var(--radius-sm)" }}
              />
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, wordBreak: "break-all" }}>
                {a.title || a.filename}
                {!a.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}> (inactive)</span>}
              </p>
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                {a.format?.toUpperCase()} • {Math.round(a.bytes / 1024)} KB
                {a.width && a.height ? ` • ${a.width}×${a.height}` : ""}
                {a.relatedId ? ` • assigned to ${a.relatedId}` : ""}
                {a.sortOrder !== 0 ? ` • sort ${a.sortOrder}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-outline" onClick={() => handleCopy(a.secureUrl, a.id)}>
                  {copied === a.id ? "Copied" : "Copy URL"}
                </button>
                <button className="btn btn-outline" onClick={() => setEditing(a)}>
                  Edit
                </button>
                <button className="btn btn-outline" disabled={busyId === a.id} onClick={() => handleToggleActive(a)}>
                  {busyId === a.id ? "Saving…" : a.active ? "Deactivate" : "Activate"}
                </button>
                <button className="btn btn-outline" disabled={busyId === a.id} onClick={() => handleDelete(a.id)}>
                  {busyId === a.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditMediaDialog
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            assets.retry();
          }}
        />
      )}
    </div>
  );
}

function EditMediaDialog({ asset, onClose, onSaved }: { asset: MediaAsset; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(asset.title ?? "");
  const [altText, setAltText] = useState(asset.altText ?? "");
  const [sortOrder, setSortOrder] = useState(String(asset.sortOrder ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsedSortOrder = Number.parseInt(sortOrder, 10);
      await updateMediaMetadata(asset.id, { title, altText, sortOrder: Number.isNaN(parsedSortOrder) ? 0 : parsedSortOrder });
      onSaved();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mh-icon-picker" role="dialog" aria-modal="true" aria-label="Edit image details" onClick={onClose}>
      <form className="mh-icon-picker__panel card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", maxWidth: 420 }}>
        <div className="mh-icon-picker__head">
          <p style={{ fontWeight: 700 }}>Edit image details</p>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <span className="mi">close</span>
          </button>
        </div>
        <img src={asset.secureUrl} alt={altText || asset.filename} style={{ width: "100%", height: 140, objectFit: "contain", background: "#fff", borderRadius: "var(--radius-sm)" }} />
        <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
          Title <span className="text-soft">(shown in this library, not to customers)</span>
          <input placeholder={asset.filename} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
          Alt text <span className="text-soft">(read aloud by screen readers wherever this image is used)</span>
          <input placeholder="e.g. Phlebotomist holding a blood sample tube" value={altText} onChange={(e) => setAltText(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
          Sort order{" "}
          <span className="text-soft">
            (when more than one active image is assigned to the same slot, the lowest number wins)
          </span>
          <input type="number" style={{ maxWidth: 120 }} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
          <button className="btn btn-outline" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

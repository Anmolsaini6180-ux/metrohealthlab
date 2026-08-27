import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { deleteMedia, listMedia } from "@/services/mediaService";
import MediaUploader from "@/components/admin/MediaUploader";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import { MEDIA_CATEGORY_LABELS, type MediaCategory } from "@/types/media";

const CATEGORIES = Object.keys(MEDIA_CATEGORY_LABELS) as MediaCategory[];

// The "Content" tree from the upload-centre spec: Branding, Banners,
// Tests, Packages, Labs. Reports are deliberately NOT browsable here —
// they're health data with per-customer authorization and live on the
// Reports screen behind expiring download links.
export default function AdminMediaPage() {
  const [category, setCategory] = useState<MediaCategory>("branding");
  const assets = useAsync(() => listMedia(category), [category]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      {assets.loading && <LoadingState rows={3} />}
      {assets.error && <ErrorState message={assets.error} onRetry={assets.retry} />}
      {assets.data && assets.data.length === 0 && (
        <EmptyState icon="image" title={`Nothing in ${MEDIA_CATEGORY_LABELS[category]} yet`} />
      )}

      {assets.data && assets.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {assets.data.map((a) => (
            <div key={a.id} className="card" style={{ display: "grid", gap: 8 }}>
              <img
                src={a.secureUrl}
                alt={a.filename}
                style={{ width: "100%", height: 120, objectFit: "contain", background: "#fff", borderRadius: "var(--radius-sm)" }}
              />
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, wordBreak: "break-all" }}>{a.filename}</p>
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                {a.format?.toUpperCase()} • {Math.round(a.bytes / 1024)} KB
                {a.width && a.height ? ` • ${a.width}×${a.height}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-outline" onClick={() => handleCopy(a.secureUrl, a.id)}>
                  {copied === a.id ? "Copied" : "Copy URL"}
                </button>
                <button className="btn btn-outline" disabled={busyId === a.id} onClick={() => handleDelete(a.id)}>
                  {busyId === a.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

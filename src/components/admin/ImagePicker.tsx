import { useMemo, useRef, useState } from "react";
import { assignMedia, getAssignedMedia, listMedia, uploadMedia } from "@/services/mediaService";
import { useAsync } from "@/hooks/useAsync";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import type { MediaAsset, MediaCategory } from "@/types/media";

interface Props {
  label: string;
  /** The slot this picker assigns into. */
  category: MediaCategory;
  relatedId: string;
  /** Called once assignment succeeds, so the parent form can refresh its own preview. */
  onAssigned?: (asset: MediaAsset) => void;
  hint?: string;
}

/**
 * Reusable "browse the Media Library, pick one, assign it here" control
 * — the one workflow every admin screen that needs an image (category
 * card, package card, lab card, About/Contact hero, campaign banner)
 * shares, instead of each screen growing its own upload-only field.
 * Search/filter, upload-a-new-one, and re-using an existing asset from
 * a completely different upload all go through the same panel.
 */
export default function ImagePicker({ label, category, relatedId, onAssigned, hint }: Props) {
  const [open, setOpen] = useState(false);
  const current = useAsync(() => getAssignedMedia(category, relatedId), [category, relatedId]);

  return (
    <div className="mh-image-picker">
      <label className="mh-image-picker__label">{label}</label>
      {hint && <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{hint}</p>}

      {current.loading && <LoadingState rows={1} />}
      {current.error && <ErrorState message={current.error} onRetry={current.retry} />}

      <div className="mh-image-picker__preview">
        {current.data ? (
          <img src={current.data.secureUrl} alt={current.data.altText ?? ""} />
        ) : (
          <span className="mh-image-picker__empty">
            <span className="mi" aria-hidden="true">image</span>
            No image assigned
          </span>
        )}
      </div>

      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        {current.data ? "Change Image" : "Choose Image"}
      </button>

      {open && (
        <ImagePickerModal
          category={category}
          relatedId={relatedId}
          onClose={() => setOpen(false)}
          onAssigned={(asset) => {
            setOpen(false);
            current.retry();
            onAssigned?.(asset);
          }}
        />
      )}
    </div>
  );
}

function ImagePickerModal({
  category,
  relatedId,
  onClose,
  onAssigned,
}: {
  category: MediaCategory;
  relatedId: string;
  onClose: () => void;
  onAssigned: (asset: MediaAsset) => void;
}) {
  // Browses the WHOLE library, not just this slot's own category — an
  // image uploaded for one package card is a perfectly legitimate
  // choice for another, and forcing a re-upload of the same file would
  // just bloat Cloudinary with duplicates.
  const library = useAsync(() => listMedia(), []);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = library.data ?? [];
    if (!q) return rows;
    return rows.filter((a) => (a.title ?? a.filename ?? "").toLowerCase().includes(q) || a.category.includes(q));
  }, [library.data, search]);

  async function handleUse(asset: MediaAsset) {
    setBusyId(asset.id);
    setError(null);
    try {
      await assignMedia(asset.id, category, relatedId);
      onAssigned({ ...asset, category, relatedId });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadMedia(file, category, relatedId);
      onAssigned(asset);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mh-icon-picker" role="dialog" aria-modal="true" aria-label="Choose an image" onClick={onClose}>
      <div className="mh-icon-picker__panel card mh-dialog-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="mh-icon-picker__head">
          <p style={{ fontWeight: 700 }}>Choose an image</p>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <span className="mi">close</span>
          </button>
        </div>

        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <input
            type="search"
            placeholder="Search the media library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <label className="mh-add-row" style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
            <span className="mi" aria-hidden="true">upload</span>
            {uploading ? "Uploading..." : "Upload a new image"}
            <input ref={inputRef} type="file" accept="image/*" hidden disabled={uploading} onChange={handleUpload} />
          </label>

          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}

          {library.loading && <LoadingState rows={3} />}
          {library.error && <ErrorState message={library.error} onRetry={library.retry} />}
          {library.data && filtered.length === 0 && (
            <EmptyState icon="image" title="No images match" description="Upload a new one above." />
          )}

          {filtered.length > 0 && (
            <div className="mh-image-picker__grid">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="mh-image-picker__option"
                  disabled={busyId === a.id}
                  onClick={() => handleUse(a)}
                >
                  <img src={a.secureUrl} alt={a.altText ?? ""} />
                  <span className="mh-image-picker__option-label">
                    {busyId === a.id ? "Assigning..." : a.title ?? a.filename}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

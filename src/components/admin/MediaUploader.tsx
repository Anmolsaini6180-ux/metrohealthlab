import { useRef, useState } from "react";
import { deleteMedia, uploadMedia } from "@/services/mediaService";
import { isCloudinaryConfigured } from "@/services/cloudinaryService";
import type { MediaAsset, MediaCategory } from "@/types/media";
import { toUserMessage } from "@/utils/errors";

interface Props {
  label: string;
  category: MediaCategory;
  relatedId?: string;
  /** Current image URL shown in the preview (e.g. the saved logoUrl). */
  value?: string;
  /** Called with the delivered Cloudinary URL once an upload is verified. */
  onChange: (url: string, asset: MediaAsset) => void;
  /** Called when the admin clears the field. */
  onClear?: () => void;
  hint?: string;
}

// Replaces the old "upload in the Firebase Console, copy the URL, paste
// it here" workflow. Upload → preview → replace → delete all happen in
// the panel. The file goes browser → Cloudinary directly using a
// short-lived server-issued signature; no secret is present in this
// bundle, and the resulting URL is only accepted after the backend has
// verified the upload with Cloudinary.
export default function MediaUploader({ label, category, relatedId, value, onChange, onClear, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<MediaAsset | null>(null);
  const configured = isCloudinaryConfigured();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires.
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setPercent(0);
    setError(null);
    try {
      const asset = await uploadMedia(file, category, relatedId, setPercent);
      setLastAsset(asset);
      onChange(asset.secureUrl, asset);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
      setPercent(0);
    }
  }

  async function handleDelete() {
    if (!lastAsset) {
      onClear?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMedia(lastAsset.id);
      setLastAsset(null);
      onClear?.();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{label}</label>
      {hint && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          {hint}
        </p>
      )}

      {value && (
        <img
          src={value}
          alt={`${label} preview`}
          style={{
            maxHeight: 96,
            maxWidth: 240,
            objectFit: "contain",
            border: "1px solid var(--color-line)",
            borderRadius: "var(--radius-sm)",
            padding: 4,
            background: "#fff",
          }}
        />
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-outline" disabled={busy || !configured} onClick={() => inputRef.current?.click()}>
          {busy ? `Uploading… ${percent}%` : value ? "Replace image" : "Upload image"}
        </button>
        {value && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={handleDelete}>
            {lastAsset ? "Delete upload" : "Clear"}
          </button>
        )}
      </div>

      {busy && (
        <div
          aria-hidden="true"
          style={{ height: 4, borderRadius: 999, background: "var(--color-line)", overflow: "hidden", maxWidth: 240 }}
        >
          <div style={{ width: `${percent}%`, height: "100%", background: "var(--color-primary)", transition: "width .15s linear" }} />
        </div>
      )}

      {!configured && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          Image upload is not configured (missing Cloudinary settings — see DEPLOYMENT.md).
        </p>
      )}

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
    </div>
  );
}

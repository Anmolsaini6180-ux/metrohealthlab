import { useMemo, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import {
  getSentNotificationBatches,
  sendBroadcastNotification,
  type BroadcastNotificationRequest,
  type NotificationBatchSummary,
} from "@/services/adminOpsService";
import { getAdminCustomers, type AdminCustomerSummary } from "@/services/adminCustomerService";
import { listMedia, uploadMedia } from "@/services/mediaService";
import type { MediaAsset } from "@/types/media";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { logOperationError, toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

const TYPE_LABELS: Record<string, string> = {
  booking_received: "Booking received",
  booking_confirmed: "Booking confirmed",
  payment_successful: "Payment successful",
  collector_assigned: "Collector assigned",
  on_the_way: "On the way",
  sample_collected: "Sample collected",
  report_ready: "Report ready",
  cancelled: "Cancelled",
  refund: "Refund",
  offer: "Offer (marketing)",
  system: "System",
};

function formatWhen(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminNotificationsPage() {
  const batches = useAsync(getSentNotificationBatches, []);
  const [showSend, setShowSend] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Notifications</h1>
        <button className="btn btn-primary" onClick={() => setShowSend((s) => !s)}>{showSend ? "Cancel" : "+ Send notification"}</button>
      </div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        This list shows notifications sent manually from here, grouped as one entry per send. Booking-lifecycle
        notifications (confirmed, collector assigned, sample collected, report ready, etc.) are sent automatically
        the moment a booking's status changes, and live in that booking's own history instead of here.
      </p>

      {showSend && (
        <SendNotificationForm
          onDone={() => {
            setShowSend(false);
            batches.retry();
          }}
        />
      )}

      {batches.loading && !batches.data && <LoadingState rows={4} />}
      {batches.error && <ErrorState message={batches.error} onRetry={batches.retry} />}
      {batches.data && batches.data.length === 0 && <EmptyState icon="notifications" title="No notifications sent yet" />}
      {batches.data && batches.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {batches.data.map((n, i) => (
            <NotificationBatchRow key={n.batchId ?? i} batch={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBatchRow({ batch: n }: { batch: NotificationBatchSummary }) {
  return (
    <div className="card" style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
      {n.imageUrl && (
        <img src={n.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600 }}>{n.title}</p>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{n.message}</p>
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
          {TYPE_LABELS[n.type] ?? n.type} • {formatWhen(n.createdAt)} • {n.recipientCount} recipient{n.recipientCount === 1 ? "" : "s"}
          {" • "}{n.readCount} read
        </p>
      </div>
    </div>
  );
}

const NO_ACTION = "__none__";
const CUSTOM_ACTION = "__custom__";

function SendNotificationForm({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selectedCustomers, setSelectedCustomers] = useState<AdminCustomerSummary[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const customerResults = useAsync(
    () => (customerSearch.trim() ? getAdminCustomers({ searchName: customerSearch.trim() }) : Promise.resolve({ customers: [], hasMore: false })),
    [customerSearch]
  );

  const [type, setType] = useState<"offer" | "system">("offer");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<MediaAsset | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [actionChoice, setActionChoice] = useState(NO_ACTION);
  const [customAction, setCustomAction] = useState("");

  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionUrl = actionChoice === NO_ACTION ? undefined : actionChoice === CUSTOM_ACTION ? customAction.trim() || undefined : actionChoice;

  const canSubmit = title.trim().length > 0 && message.trim().length > 0 && (audience === "all" || selectedCustomers.length > 0);
  const recipientLabel =
    audience === "all"
      ? "every current customer (staff accounts are never included)"
      : `${selectedCustomers.length} selected customer${selectedCustomers.length === 1 ? "" : "s"}`;

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const payload: BroadcastNotificationRequest = {
        audience,
        customerUids: audience === "selected" ? selectedCustomers.map((c) => c.uid) : undefined,
        type,
        title: title.trim(),
        message: message.trim(),
        imageUrl: image?.secureUrl,
        actionUrl,
      };
      const result = await sendBroadcastNotification(payload);
      showToast(`Notification sent to ${result.recipientCount} customer${result.recipientCount === 1 ? "" : "s"}.`);
      setPendingConfirm(false);
      onDone();
    } catch (err) {
      logOperationError("sendBroadcastNotification", err, { audience });
      setError(toUserMessage(err));
      setPendingConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Audience</span>
        <select value={audience} onChange={(e) => setAudience(e.target.value as "all" | "selected")}>
          <option value="all">All customers</option>
          <option value="selected">Selected customers</option>
        </select>
      </label>

      {audience === "selected" && (
        <div style={{ display: "grid", gap: 6 }}>
          {selectedCustomers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedCustomers.map((c) => (
                <span key={c.uid} className="mh-removable-chip">
                  {c.name || c.email || c.uid}
                  <button
                    type="button"
                    aria-label={`Remove ${c.name || c.email}`}
                    onClick={() => setSelectedCustomers((list) => list.filter((x) => x.uid !== c.uid))}
                  >
                    <span className="mi" aria-hidden="true">close</span>
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="search"
            placeholder="Search customers by name or email..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />
          {customerSearch.trim() && (
            <div className="card" style={{ maxHeight: 200, overflowY: "auto", display: "grid", gap: 4 }}>
              {customerResults.loading && <LoadingState rows={2} />}
              {customerResults.data && customerResults.data.customers.length === 0 && (
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No customers match.</p>
              )}
              {customerResults.data?.customers
                .filter((c) => !selectedCustomers.some((s) => s.uid === c.uid))
                .map((c) => (
                  <button
                    key={c.uid}
                    type="button"
                    className="btn btn-outline"
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => {
                      setSelectedCustomers((list) => [...list, c]);
                      setCustomerSearch("");
                    }}
                  >
                    {c.name || "(no name)"} {c.email && <span className="text-soft">• {c.email}</span>}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <select value={type} onChange={(e) => setType(e.target.value as "offer" | "system")}>
        <option value="offer">Offer (marketing)</option>
        <option value="system">System (general)</option>
      </select>
      <input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <textarea placeholder="Message" rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />

      <div>
        <p style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 4 }}>Image (optional)</p>
        {image ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={image.secureUrl} alt="" style={{ width: 56, height: 56, borderRadius: "var(--radius-sm)", objectFit: "cover" }} />
            <button type="button" className="btn btn-outline" onClick={() => setImage(null)}>Remove image</button>
          </div>
        ) : (
          <button type="button" className="btn btn-outline" onClick={() => setShowImagePicker(true)}>Choose Image</button>
        )}
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Optional action</span>
        <select value={actionChoice} onChange={(e) => setActionChoice(e.target.value)}>
          <option value={NO_ACTION}>No action</option>
          <option value="/offers">Open Offers page</option>
          <option value="/packages">Open Packages page</option>
          <option value={CUSTOM_ACTION}>Custom in-app link...</option>
        </select>
      </label>
      {actionChoice === CUSTOM_ACTION && (
        <input
          placeholder="/packages/some-package-slug"
          value={customAction}
          onChange={(e) => setCustomAction(e.target.value)}
        />
      )}

      <div className="card" style={{ background: "var(--color-bg-tint)" }}>
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: 6 }}>Preview</p>
        <div style={{ display: "flex", gap: 8 }}>
          {image && <img src={image.secureUrl} alt="" style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }} />}
          <div>
            <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{title.trim() || "Notification title"}</p>
            <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{message.trim() || "Notification message will appear here."}</p>
          </div>
        </div>
      </div>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}

      <button className="btn btn-primary" type="button" disabled={!canSubmit || busy} onClick={() => setPendingConfirm(true)}>
        Send Notification
      </button>

      {pendingConfirm && (
        <ConfirmDialog
          title="Send this notification?"
          message={`You are about to send "${title.trim()}" to ${recipientLabel}.`}
          confirmLabel={busy ? "Sending..." : "Send Notification"}
          busy={busy}
          onConfirm={handleSend}
          onCancel={() => setPendingConfirm(false)}
        />
      )}

      {showImagePicker && (
        <NotificationImagePickerModal
          onClose={() => setShowImagePicker(false)}
          onPicked={(asset) => {
            setImage(asset);
            setShowImagePicker(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * A lighter variant of the shared ImagePicker for this one screen:
 * ImagePicker persists a (category, relatedId) SLOT assignment on
 * every pick/upload, which fits a fixed page position (About hero, a
 * package card) but not a one-off outgoing notification — there is no
 * slot to assign into, and assigning one here would just leave a
 * stray, immediately-stale media_assets.related_id behind, or
 * silently overwrite whatever a real slot already pointed at if the
 * relatedId collided. Uses the exact same underlying
 * listMedia/uploadMedia calls (and the same media_assets/Cloudinary
 * pipeline) — no second upload system — just returns the picked
 * asset's URL to hold in this form's own state instead of persisting
 * an assignment immediately.
 */
function NotificationImagePickerModal({ onClose, onPicked }: { onClose: () => void; onPicked: (asset: MediaAsset) => void }) {
  const library = useAsync(() => listMedia(), []);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = library.data ?? [];
    if (!q) return rows;
    return rows.filter((a) => (a.title ?? a.filename ?? "").toLowerCase().includes(q));
  }, [library.data, search]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadMedia(file, "notifications");
      onPicked(asset);
    } catch (err) {
      logOperationError("uploadMedia (notification)", err, { bytes: file.size, type: file.type });
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
          <input type="search" placeholder="Search the media library..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="mh-add-row" style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
            <span className="mi" aria-hidden="true">upload</span>
            {uploading ? "Uploading..." : "Upload a new image"}
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={handleUpload} />
          </label>
          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
          {library.loading && <LoadingState rows={3} />}
          {library.error && <ErrorState message={library.error} onRetry={library.retry} />}
          {library.data && filtered.length === 0 && <EmptyState icon="image" title="No images match" description="Upload a new one above." />}
          {filtered.length > 0 && (
            <div className="mh-image-picker__grid">
              {filtered.map((a) => (
                <button key={a.id} type="button" className="mh-image-picker__option" onClick={() => onPicked(a)}>
                  <img src={a.secureUrl} alt={a.altText ?? ""} />
                  <span className="mh-image-picker__option-label">{a.title ?? a.filename}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

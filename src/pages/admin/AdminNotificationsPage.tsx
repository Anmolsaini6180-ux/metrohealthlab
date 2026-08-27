import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getAllNotifications, sendAdminNotification } from "@/services/adminOpsService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

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

export default function AdminNotificationsPage() {
  const notifications = useAsync(getAllNotifications, []);
  const [showSend, setShowSend] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Notifications</h1>
        <button className="btn btn-primary" onClick={() => setShowSend((s) => !s)}>{showSend ? "Cancel" : "+ Send notification"}</button>
      </div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        This list shows every notification ever sent (automatic booking/payment events plus admin-sent
        ones) — only "Offer" and "System" notifications can be sent manually from here; the rest are
        written only by the real events they describe.
      </p>

      {showSend && <SendNotificationForm onDone={() => { setShowSend(false); notifications.retry(); }} />}

      {notifications.loading && <LoadingState rows={4} />}
      {notifications.error && <ErrorState message={notifications.error} onRetry={notifications.retry} />}
      {notifications.data && notifications.data.length === 0 && <EmptyState icon="notifications" title="No notifications sent yet" />}
      {notifications.data && notifications.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {notifications.data.map((n) => (
            <div key={n.id} className="card">
              <p style={{ fontWeight: 600 }}>{n.title}</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{n.message}</p>
              <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                {TYPE_LABELS[n.type] ?? n.type} • {n.read ? "read" : "unread"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SendNotificationForm({ onDone }: { onDone: () => void }) {
  const [customerUid, setCustomerUid] = useState("");
  const [type, setType] = useState<"offer" | "system">("offer");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendAdminNotification({ customerUid, type, title, message });
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Customer user ID (find via /admin/customers)" required value={customerUid} onChange={(e) => setCustomerUid(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value as "offer" | "system")}>
        <option value="offer">Offer (marketing)</option>
        <option value="system">System (general)</option>
      </select>
      <input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Message" rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Sending..." : "Send"}</button>
    </form>
  );
}

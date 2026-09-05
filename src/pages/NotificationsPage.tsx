import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from "@/services/notificationService";
import type { AppNotification, NotificationType } from "@/types/notification";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

const TYPE_ICON: Record<NotificationType, string> = {
  booking_received: "receipt_long",
  booking_confirmed: "check_circle",
  payment_successful: "payments",
  collector_assigned: "person_pin_circle",
  on_the_way: "directions_car",
  sample_collected: "colorize",
  report_ready: "description",
  cancelled: "cancel",
  refund: "currency_rupee",
  offer: "local_offer",
  system: "info",
};

function formatWhen(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function NotificationsPage() {
  // notifications.user_id is a Supabase uuid FK to profiles.id — never
  // the Firebase user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseUserId) return;
    const unsubscribe = subscribeToNotifications(supabaseUserId, setNotifications, (e) => setError(e.message));
    return unsubscribe;
  }, [supabaseUserId]);

  if (error) return <ErrorState message={error} />;

  const hasUnread = !!notifications?.some((n) => !n.read);

  function handleOpen(n: AppNotification) {
    if (!n.read) markNotificationRead(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Notifications</h1>
        {hasUnread && supabaseUserId && (
          <button className="btn btn-outline" onClick={() => markAllNotificationsRead(supabaseUserId)}>
            Mark all as read
          </button>
        )}
      </div>
      {notifications === null && <LoadingState rows={3} />}
      {notifications && notifications.length === 0 && <EmptyState icon="notifications" title="No notifications yet" />}
      {notifications && notifications.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {notifications.map((n) => (
            <button
              key={n.id}
              className="card"
              style={{
                textAlign: "left",
                display: "flex",
                gap: "var(--space-sm)",
                alignItems: "flex-start",
                background: n.read ? "var(--color-surface)" : "var(--color-bg-tint)",
                cursor: n.actionUrl ? "pointer" : "default",
              }}
              onClick={() => handleOpen(n)}
            >
              {n.imageUrl ? (
                <img
                  src={n.imageUrl}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-bg-tint)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "var(--color-primary)",
                  }}
                >
                  <span className="mi">{TYPE_ICON[n.type] ?? "notifications"}</span>
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}</span>
                  <span className="text-soft" style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>{formatWhen(n.createdAt)}</span>
                </span>
                <span className="text-soft" style={{ fontSize: "var(--text-sm)", display: "block", marginTop: 2 }}>{n.message}</span>
              </span>
              {!n.read && (
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0, marginTop: 6 }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

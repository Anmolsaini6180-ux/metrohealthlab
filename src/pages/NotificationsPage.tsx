import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from "@/services/notificationService";
import type { AppNotification } from "@/types/notification";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function NotificationsPage() {
  // notifications.user_id is a Supabase uuid FK to profiles.id — never
  // the Firebase user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseUserId) return;
    const unsubscribe = subscribeToNotifications(supabaseUserId, setNotifications, (e) => setError(e.message));
    return unsubscribe;
  }, [supabaseUserId]);

  if (error) return <ErrorState message={error} />;

  const hasUnread = !!notifications?.some((n) => !n.read);

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
              style={{ textAlign: "left", background: n.read ? "var(--color-surface)" : "var(--color-bg-tint)" }}
              onClick={() => !n.read && markNotificationRead(n.id)}
            >
              <p style={{ fontWeight: 600 }}>{n.title}</p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{n.message}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

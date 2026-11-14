import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from "@/services/notificationService";
import { NotificationListItem, resolveNotificationTarget, TYPE_GROUP, type NotificationGroup } from "@/components/notifications/notificationDisplay";
import type { AppNotification } from "@/types/notification";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

const PAGE_SIZE = 50;

type Tab = "all" | "unread" | NotificationGroup;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "booking", label: "Booking" },
  { id: "reports", label: "Reports" },
  { id: "offers", label: "Offers" },
  { id: "system", label: "System" },
];

function matchesTab(n: AppNotification, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "unread") return !n.read;
  return TYPE_GROUP[n.type] === tab;
}

export default function NotificationsPage() {
  // notifications.user_id is a Supabase uuid FK to profiles.id — never
  // the Firebase user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  // How many of the most recent notifications to keep loaded — "Load
  // more" just raises this and lets the existing subscription re-fetch
  // with the bigger limit, same pattern subscribeToNotifications
  // already uses for every realtime refetch.
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!supabaseUserId) return;
    setNotifications(null);
    const unsubscribe = subscribeToNotifications(supabaseUserId, setNotifications, (e) => setError(e.message), limit);
    return unsubscribe;
  }, [supabaseUserId, limit]);

  if (error) return <ErrorState message={error} onRetry={() => setError(null)} />;

  const hasUnread = !!notifications?.some((n) => !n.read);
  const visible = (notifications ?? []).filter((n) => matchesTab(n, tab));
  // If a fresh fetch came back with fewer rows than we asked for, there
  // is nothing more to load — no separate "total count" query needed.
  const canLoadMore = (notifications?.length ?? 0) >= limit;

  function handleOpen(n: AppNotification) {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
    const target = resolveNotificationTarget(n);
    if (target) navigate(target);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-sm)" }}>
        <h1 className="mh2-dashboard__section-title" style={{ fontSize: "var(--text-2xl)" }}>Notifications</h1>
        {hasUnread && supabaseUserId && (
          <button className="mh2-btn mh2-btn--outline mh2-btn--sm" onClick={() => markAllNotificationsRead(supabaseUserId)}>
            Mark all as read
          </button>
        )}
      </div>

      <div className="mh2-tab-row" role="tablist" aria-label="Filter notifications" style={{ marginBottom: "var(--space-md)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`mh2-tab-btn${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notifications === null && <LoadingState rows={3} />}
      {notifications && notifications.length === 0 && <EmptyState icon="notifications" title="No notifications yet" />}
      {notifications && notifications.length > 0 && visible.length === 0 && (
        <EmptyState icon="search_off" title="No notifications in this category" />
      )}
      {visible.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {visible.map((n) => (
            <NotificationListItem key={n.id} notification={n} onOpen={handleOpen} />
          ))}
        </div>
      )}

      {/* Only meaningful against "All"/"Unread" — a category tab filters
          the already-loaded page client-side, and loading more of the
          same underlying feed is what actually reveals older rows of
          that category, so the action reads clearest off the full list. */}
      {tab === "all" && canLoadMore && (
        <div style={{ textAlign: "center", marginTop: "var(--space-md)" }}>
          <button className="mh2-btn mh2-btn--outline" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

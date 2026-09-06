import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotificationsCount } from "@/hooks/useUnreadNotificationsCount";
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from "@/services/notificationService";
import { NotificationListItem, resolveNotificationTarget } from "@/components/notifications/notificationDisplay";
import type { AppNotification } from "@/types/notification";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

// Recent-only — this is a quick-glance dropdown, not the full history.
// NotificationsPage.tsx (linked from the footer below) is where a
// customer sees everything with search/filters/pagination.
const PANEL_LIMIT = 8;

// Shared by both header variants (mobile hero + desktop bar) so the
// two can't drift apart. Like ProfileMenu, it waits for auth to
// resolve before deciding where to link — otherwise a signed-in user
// tapping during the brief loading window gets sent to /login.
//
// Also reused as-is in AdminLayout (see seeAllHref) — an admin/staff
// account has its own real notification rows (booking_automation_alert,
// staff_status_update) written by the same automation/status-change
// paths as customer notifications, and before this there was genuinely
// no way to see them again once the moment's push toast passed: no
// badge, no list, nothing. Same table, same RLS (a staff member's own
// user_id row), same components — not a parallel notification system.
export default function NotificationBell({ seeAllHref = "/notifications" }: { seeAllHref?: string }) {
  const { user, loading, supabaseUserId } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadNotificationsCount();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  // Only subscribes to the actual list while the panel is open — the
  // badge count above already keeps its own always-on lightweight
  // subscription (see useUnreadNotificationsCount); fetching the full
  // recent list is only worth doing once the customer asks to see it.
  // Re-running this each time `open` flips true also means simply
  // reopening the bell is how a failed load gets retried.
  useEffect(() => {
    if (!open || !supabaseUserId) return;
    setNotifications(null);
    setError(null);
    const unsubscribe = subscribeToNotifications(supabaseUserId, setNotifications, (e) => setError(e.message), PANEL_LIMIT);
    return unsubscribe;
  }, [open, supabaseUserId]);

  if (loading) {
    return (
      <button className="icon-btn" aria-label="Notifications" disabled style={{ opacity: 0.6 }}>
        <span className="mi">notifications</span>
      </button>
    );
  }

  if (!user) {
    return (
      <Link className="icon-btn" to="/login" aria-label="Notifications">
        <span className="mi">notifications</span>
      </Link>
    );
  }

  function handleOpenNotification(n: AppNotification) {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
    const target = resolveNotificationTarget(n);
    setOpen(false);
    if (target) navigate(target);
  }

  const hasUnread = !!notifications?.some((n) => !n.read);

  return (
    <div className="mh-notification-menu" ref={rootRef}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications" aria-expanded={open}>
        <span className="mi">notifications</span>
        {unreadCount > 0 && <span className="mh-badge-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="mh-notification-menu__panel" role="dialog" aria-label="Notifications">
          <div className="mh-notification-menu__head">
            <h2>Notifications</h2>
            {hasUnread && (
              <button
                className="btn btn-outline"
                style={{ padding: "4px 10px", fontSize: "var(--text-xs)" }}
                onClick={() => supabaseUserId && markAllNotificationsRead(supabaseUserId)}
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="mh-notification-menu__list">
            {error && <ErrorState message={error} />}
            {!error && notifications === null && <LoadingState rows={3} />}
            {!error && notifications && notifications.length === 0 && (
              <EmptyState icon="notifications" title="No notifications yet" />
            )}
            {!error &&
              notifications?.map((n) => <NotificationListItem key={n.id} notification={n} onOpen={handleOpenNotification} compact />)}
          </div>
          <div className="mh-notification-menu__foot">
            <Link to={seeAllHref} onClick={() => setOpen(false)}>
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

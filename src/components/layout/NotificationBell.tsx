import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotificationsCount } from "@/hooks/useUnreadNotificationsCount";

// Shared by both header variants (mobile hero + desktop bar) so the
// two can't drift apart. Like ProfileMenu, it waits for auth to
// resolve before deciding where to link — otherwise a signed-in user
// tapping during the brief loading window gets sent to /login.
export default function NotificationBell() {
  const { user, loading } = useAuth();
  const unreadCount = useUnreadNotificationsCount();

  if (loading) {
    return (
      <button className="icon-btn" aria-label="Notifications" disabled style={{ opacity: 0.6 }}>
        <span className="mi">notifications</span>
      </button>
    );
  }

  return (
    <Link className="icon-btn" to={user ? "/notifications" : "/login"} aria-label="Notifications">
      <span className="mi">notifications</span>
      {user && unreadCount > 0 && (
        <span className="mh-badge-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>
      )}
    </Link>
  );
}

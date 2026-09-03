import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { adminHomePathForRole, adminMenuLabelForRole } from "@/utils/roleAccess";
import { logout } from "@/services/authService";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
  { to: "/profile/patients", label: "Family members", icon: "group" },
  { to: "/profile/addresses", label: "Addresses", icon: "location_on" },
  { to: "/bookings", label: "Bookings", icon: "calendar_month" },
  { to: "/reports", label: "Reports", icon: "description" },
  { to: "/notifications", label: "Notifications", icon: "notifications" },
  { to: "/support", label: "Support", icon: "support_agent" },
];

export default function ProfilePage() {
  const { profile, user } = useAuth();
  const { role } = useAdminRole();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  const initial = (profile?.name ?? profile?.email ?? user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="mh-profile">
      <div className="mh-profile__head">
        <div className="mh-profile__avatar">{initial}</div>
        <div>
          <p className="mh-profile__name">{profile?.name ?? "Your account"}</p>
          <p className="mh-profile__contact">{profile?.email ?? user?.email ?? profile?.phone ?? ""}</p>
        </div>
      </div>

      <div className="mh-profile__menu">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="mh-profile__item">
            <span className="mh-profile__item-icon" aria-hidden="true">
              <span className="mi">{l.icon}</span>
            </span>
            <span className="mh-profile__item-label">{l.label}</span>
            <span className="mi mh-profile__item-chevron" aria-hidden="true">chevron_right</span>
          </Link>
        ))}
        {/* Shown only when the ID token actually carries a staff role
            claim. A normal customer never sees this — and if they
            navigated to /admin directly anyway, AdminProtectedRoute and
            the RLS policies would both refuse them. */}
        {adminHomePathForRole(role) && (
          <Link to={adminHomePathForRole(role)!} className="mh-profile__item">
            <span className="mh-profile__item-icon is-accent" aria-hidden="true">
              <span className="mi">admin_panel_settings</span>
            </span>
            <span className="mh-profile__item-label">{adminMenuLabelForRole(role)}</span>
            <span className="mi mh-profile__item-chevron" aria-hidden="true">chevron_right</span>
          </Link>
        )}
      </div>

      <button className="mh-profile__logout" onClick={handleLogout}>
        <span className="mi" aria-hidden="true">logout</span>
        Log out
      </button>
    </div>
  );
}

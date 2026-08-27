import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { logout } from "@/services/authService";
import { adminHomePathForRole, adminMenuLabelForRole } from "@/utils/roleAccess";

const MENU_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
  { to: "/bookings", label: "My Bookings", icon: "calendar_month" },
  { to: "/reports", label: "Reports", icon: "description" },
  { to: "/profile", label: "My Profile", icon: "person" },
  { to: "/profile/addresses", label: "Addresses", icon: "location_on" },
  { to: "/notifications", label: "Notifications", icon: "notifications" },
];

export default function ProfileMenu() {
  const { user, loading } = useAuth();
  const { role } = useAdminRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // While auth is still resolving, `user` is briefly null — rendering
  // the logged-out link here would send an already-signed-in user to
  // /login if they tapped during that window. Show an inert button
  // instead until we actually know.
  if (loading) {
    return (
      <button className="icon-btn" aria-label="Account" disabled style={{ opacity: 0.6 }}>
        <span className="mi">person</span>
      </button>
    );
  }

  if (!user) {
    return (
      <Link className="icon-btn" to="/login" aria-label="Log in">
        <span className="mi">person</span>
      </Link>
    );
  }

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  return (
    <div className="mh-profile-menu" ref={rootRef}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open}>
        <span className="mi">person</span>
      </button>
      {open && (
        <div className="mh-profile-menu__panel">
          {MENU_LINKS.map((link) => (
            <Link key={link.to} to={link.to} onClick={() => setOpen(false)}>
              <span className="mi" style={{ fontSize: 18, color: "var(--color-primary)" }}>{link.icon}</span>
              {link.label}
            </Link>
          ))}
          {/* Only ever shown when the ID token actually carries a staff
              role claim — hiding/showing this is UX convenience only;
              AdminProtectedRoute + firestore.rules are what actually
              stop an unauthorized user from reaching /admin. */}
          {adminHomePathForRole(role) && (
            <Link to={adminHomePathForRole(role)!} onClick={() => setOpen(false)}>
              <span className="mi" style={{ fontSize: 18, color: "var(--color-accent)" }}>admin_panel_settings</span>
              {adminMenuLabelForRole(role)}
            </Link>
          )}
          <button onClick={handleLogout}>
            <span className="mi" style={{ fontSize: 18, color: "var(--color-danger)" }}>logout</span>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

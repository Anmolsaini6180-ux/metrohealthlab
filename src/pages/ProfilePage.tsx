import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
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
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--color-bg-tint)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "var(--text-xl)",
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{profile?.name ?? "Your account"}</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            {profile?.email ?? user?.email ?? profile?.phone ?? ""}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: "var(--space-sm)" }}>
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="card" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span className="mi" style={{ color: "var(--color-primary)" }}>{l.icon}</span>
            {l.label}
          </Link>
        ))}
        {role && (
          <Link to={role === "COLLECTION_AGENT" ? "/agent" : "/admin"} className="card" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span className="mi" style={{ color: "var(--color-accent)" }}>admin_panel_settings</span>
            {role === "COLLECTION_AGENT" ? "My Collections" : "Admin Dashboard"}
          </Link>
        )}
      </div>

      <button className="btn btn-outline" onClick={handleLogout}>
        Log out
      </button>
    </div>
  );
}

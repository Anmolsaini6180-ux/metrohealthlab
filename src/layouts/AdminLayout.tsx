import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { CAN_MANAGE_CATALOG, CAN_MANAGE_TEAM, CAN_VIEW_ANALYTICS } from "@/types/team";
import Logo from "@/components/brand/Logo";
import Breadcrumbs from "@/components/admin/Breadcrumbs";
import { logout } from "@/services/authService";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: "space_dashboard", end: true, roles: null },
  { to: "/admin/bookings", label: "Bookings", icon: "calendar_month", roles: null },
  { to: "/admin/tests", label: "Tests", icon: "science", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/categories", label: "Categories", icon: "category", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/packages", label: "Packages", icon: "inventory_2", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/labs", label: "Labs", icon: "storefront", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/pricing", label: "Pricing", icon: "payments", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/marketing", label: "Marketing", icon: "campaign", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/slots", label: "Slots", icon: "event", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/service-areas", label: "Service Areas", icon: "location_on", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/customers", label: "Customers", icon: "group", roles: null },
  { to: "/admin/reports", label: "Reports", icon: "description", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/payments", label: "Payments", icon: "account_balance_wallet", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/notifications", label: "Notifications", icon: "notifications", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/content/articles", label: "Articles", icon: "article", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/content/media", label: "Media library", icon: "photo_library", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/settings/branding", label: "Branding", icon: "storefront", roles: CAN_MANAGE_CATALOG },
  { to: "/admin/team", label: "Team", icon: "groups", roles: CAN_MANAGE_TEAM },
  { to: "/admin/team/performance", label: "Team Performance", icon: "insights", roles: CAN_VIEW_ANALYTICS },
  { to: "/agent", label: "My Collections", icon: "local_shipping", roles: ["COLLECTION_AGENT"] },
  { to: "/admin/security/audit-logs", label: "Audit Logs", icon: "history", roles: ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"] },
] as const;

export default function AdminLayout() {
  const { role } = useAdminRole();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/admin/login");
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (role && (item.roles as readonly string[]).includes(role)));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }} className="mh-admin-shell">
      <aside style={{ borderRight: "1px solid var(--color-line)", padding: "var(--space-md)", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        <div>
          <Logo variant="compact" height={32} />
          <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>Admin • {role}</p>
        </div>
        <nav style={{ display: "grid", gap: 4 }}>
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : false}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-sm)",
                background: isActive ? "var(--color-bg-tint)" : "transparent",
                color: isActive ? "var(--color-primary)" : "var(--color-ink)",
              })}
            >
              <span className="mi" style={{ fontSize: 20 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="btn btn-outline" style={{ marginTop: "auto" }} onClick={handleLogout}>
          Log out
        </button>
      </aside>
      <main style={{ padding: "var(--space-lg)" }}>
        <Breadcrumbs />
        <Outlet />
      </main>
    </div>
  );
}

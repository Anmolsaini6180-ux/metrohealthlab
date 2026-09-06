import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import { CAN_MANAGE_CATALOG, CAN_MANAGE_TEAM, CAN_VIEW_ANALYTICS } from "@/types/team";
import Logo from "@/components/brand/Logo";
import Breadcrumbs from "@/components/admin/Breadcrumbs";
import { logout } from "@/services/authService";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  roles: readonly string[] | null;
}

// Grouped the same way the sidebar renders them, matching how the
// business actually thinks about these screens (a booking is not a
// "catalogue" concern) rather than one flat 20-item list.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: "space_dashboard", end: true, roles: null },
      { to: "/admin/bookings", label: "Bookings", icon: "calendar_month", roles: null },
      { to: "/admin/bookings/dashboard", label: "Booking Dashboard", icon: "insights", roles: null },
      { to: "/admin/customers", label: "Customers", icon: "group", roles: null },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { to: "/admin/categories", label: "Categories", icon: "category", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/tests", label: "Tests", icon: "science", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/packages", label: "Packages", icon: "inventory_2", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/labs", label: "Labs", icon: "storefront", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/pricing", label: "Pricing", icon: "payments", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/slots", label: "Slots", icon: "event", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/service-areas", label: "Service Areas", icon: "location_on", roles: CAN_MANAGE_CATALOG },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: "/admin/marketing", label: "Marketing", icon: "campaign", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/marketing/offers", label: "Offers", icon: "local_offer", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/marketing/banners", label: "Banners", icon: "photo", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/marketing/coupons", label: "Coupons", icon: "confirmation_number", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/marketing/campaigns", label: "Campaigns", icon: "campaign", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/marketing/leads", label: "Leads", icon: "person_search", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/marketing/segments", label: "Segments", icon: "pie_chart", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/content/articles", label: "Articles", icon: "article", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/content/pages", label: "Website Content", icon: "description", roles: CAN_MANAGE_CATALOG },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/admin/reports", label: "Reports", icon: "description", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/content/media", label: "Media Library", icon: "photo_library", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/payments", label: "Payments", icon: "account_balance_wallet", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/notifications", label: "Notifications", icon: "notifications", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/support", label: "Support", icon: "support_agent", roles: CAN_MANAGE_CATALOG },
      { to: "/agent", label: "My Collections", icon: "local_shipping", roles: ["COLLECTION_AGENT"] },
      { to: "/admin/security/audit-logs", label: "Audit Logs", icon: "history", roles: ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"] },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/admin/settings/branding", label: "Branding", icon: "storefront", roles: CAN_MANAGE_CATALOG },
      { to: "/admin/settings/staff", label: "Admin & Staff", icon: "admin_panel_settings", roles: CAN_MANAGE_TEAM },
      { to: "/admin/team/performance", label: "Team Performance", icon: "insights", roles: CAN_VIEW_ANALYTICS },
      // Tightened from CAN_VIEW_ANALYTICS (which includes SUB_ADMIN):
      // Finance now surfaces TP, gross margin and expense/salary
      // categories, none of which are general analytics — see
      // get_finance_report()'s own can_manage_catalog() gate.
      { to: "/admin/finance", label: "Finance", icon: "payments", roles: CAN_MANAGE_CATALOG },
    ],
  },
];

export default function AdminLayout() {
  const { role } = useAdminRole();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A route change is the one moment a mobile nav tap has definitely
  // been handled - close the drawer then, rather than requiring every
  // NavLink to carry its own onClick.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/admin/login");
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
  })).filter((group) => group.items.length > 0);

  const initial = (profile?.name ?? profile?.email ?? user?.email ?? "?").charAt(0).toUpperCase();

  const nav = (
    <nav className="mh-admin-nav">
      {visibleGroups.map((group) => (
        <div className="mh-admin-nav__group" key={group.title}>
          <p className="mh-admin-nav__group-title">{group.title}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mh-admin-nav__link${isActive ? " is-active" : ""}`}
            >
              <span className="mi" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="mh-admin-shell">
      {/* Sticky topbar: hamburger (mobile only) + brand + account cluster.
          The sidebar below still carries full navigation on desktop; on
          mobile the hamburger opens it as a slide-in drawer instead. */}
      <header className="mh-admin-topbar">
        <button
          type="button"
          className="mh-admin-topbar__burger"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span className="mi" aria-hidden="true">{drawerOpen ? "close" : "menu"}</span>
        </button>
        <Link to="/" className="mh-admin-topbar__logo" aria-label="Go to the website home page">
          <Logo variant="compact" height={28} />
        </Link>
        <div className="mh-admin-topbar__spacer" />
        <NavLink to="/admin/notifications" className="mh-admin-topbar__icon" aria-label="Notifications">
          <span className="mi" aria-hidden="true">notifications</span>
        </NavLink>
        <div className="mh-admin-topbar__account">
          <span className="mh-admin-topbar__avatar" aria-hidden="true">{initial}</span>
          <span className="mh-admin-topbar__who">
            <span className="mh-admin-topbar__name">{profile?.name ?? user?.email ?? "Signed in"}</span>
            <span className="mh-admin-topbar__role">{role}</span>
          </span>
        </div>
        <button type="button" className="btn btn-outline mh-admin-topbar__logout" onClick={handleLogout}>
          <span className="mi" aria-hidden="true">logout</span>
          Log out
        </button>
      </header>

      <div className="mh-admin-body">
        <aside className="mh-admin-sidebar">{nav}</aside>

        {drawerOpen && (
          <div className="mh-admin-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation">
            <div className="mh-admin-drawer__backdrop" onClick={() => setDrawerOpen(false)} />
            <div className="mh-admin-drawer__panel">
              <div className="mh-admin-drawer__head">
                <Link to="/" className="mh-admin-topbar__logo" aria-label="Go to the website home page">
                  <Logo variant="compact" height={26} />
                </Link>
                <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
                  <span className="mi">close</span>
                </button>
              </div>
              <div className="mh-admin-topbar__account mh-admin-drawer__account">
                <span className="mh-admin-topbar__avatar" aria-hidden="true">{initial}</span>
                <span className="mh-admin-topbar__who">
                  <span className="mh-admin-topbar__name">{profile?.name ?? user?.email ?? "Signed in"}</span>
                  <span className="mh-admin-topbar__role">{role}</span>
                </span>
              </div>
              {nav}
              <button type="button" className="btn btn-outline mh-admin-drawer__logout" onClick={handleLogout}>
                <span className="mi" aria-hidden="true">logout</span>
                Log out
              </button>
            </div>
          </div>
        )}

        <main className="mh-admin-main">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

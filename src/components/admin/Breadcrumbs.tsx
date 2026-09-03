import { Link, useLocation } from "react-router-dom";

const LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Agent",
  bookings: "Bookings",
  dashboard: "Dashboard",
  tests: "Tests",
  categories: "Categories",
  packages: "Packages",
  labs: "Labs",
  pricing: "Pricing",
  marketing: "Marketing",
  offers: "Offers",
  banners: "Banners",
  coupons: "Coupons",
  campaigns: "Campaigns",
  leads: "Leads",
  segments: "Segments",
  slots: "Slots",
  "service-areas": "Service Areas",
  customers: "Customers",
  reports: "Reports",
  payments: "Payments",
  notifications: "Notifications",
  content: "Content",
  articles: "Articles",
  media: "Media Library",
  settings: "Settings",
  branding: "Branding",
  staff: "Admin & Staff",
  team: "Team",
  performance: "Performance",
  security: "Security",
  "audit-logs": "Audit Logs",
};

export default function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-md)", display: "flex", gap: 6, flexWrap: "wrap" }}>
      {segments.map((seg, i) => {
        const path = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const label = LABELS[seg] ?? seg;
        return (
          <span key={path} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span className="text-soft">/</span>}
            {isLast ? (
              <span className="text-soft">{label}</span>
            ) : (
              <Link to={path} style={{ color: "var(--color-primary)" }}>{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

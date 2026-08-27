import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { getAllCampaigns, getLeads } from "@/services/adminMarketingService";
import { getAllOffers, getAllCoupons } from "@/services/adminCatalogService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { getAdminBookings } from "@/services/adminBookingService";
import { formatCurrencyInr } from "@/services/pricingService";

const MODULES = [
  { to: "/admin/marketing/campaigns", label: "Campaigns", icon: "campaign" },
  { to: "/admin/marketing/offers", label: "Offers", icon: "local_offer" },
  { to: "/admin/marketing/banners", label: "Banners", icon: "view_carousel" },
  { to: "/admin/marketing/coupons", label: "Coupons", icon: "sell" },
  { to: "/admin/marketing/segments", label: "Segments", icon: "groups" },
  { to: "/admin/marketing/leads", label: "Leads", icon: "person_add" },
];

export default function AdminMarketingPage() {
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));

  const campaigns = useAsync(getAllCampaigns, []);
  const offers = useAsync(getAllOffers, []);
  const coupons = useAsync(getAllCoupons, []);
  const leads = useAsync(() => getLeads(range), [range.startDate, range.endDate]);
  const bookings = useAsync(() => getAdminBookings(range).then((r) => r.bookings), [range.startDate, range.endDate]);

  const loading = campaigns.loading || offers.loading || coupons.loading || leads.loading || bookings.loading;
  const error = campaigns.error || offers.error || coupons.error || leads.error || bookings.error;

  const activeCampaigns = (campaigns.data ?? []).filter((c) => c.status === "RUNNING").length;
  const activeOffers = (offers.data ?? []).filter((o) => o.active).length;
  const couponUsage = (coupons.data ?? []).reduce((sum, c) => sum + (c.usedCount ?? 0), 0);
  const leadsCount = (leads.data ?? []).length;
  const conversions = (leads.data ?? []).filter((l) => l.status === "CONVERTED").length;
  const couponBookings = (bookings.data ?? []).filter((b) => b.couponId);
  const bookingsGenerated = couponBookings.length;
  const revenueGenerated = couponBookings.filter((b) => b.paymentStatus === "success").reduce((s, b) => s + b.finalAmount, 0);

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <h1 style={{ fontSize: "var(--text-xl)" }}>Marketing</h1>

      <div className="mh-stat-grid">
        {MODULES.map((m) => (
          <Link key={m.to} to={m.to} className="card mh-quick-action">
            <span className="mi" style={{ fontSize: 26, color: "var(--color-primary)" }}>{m.icon}</span>
            {m.label}
          </Link>
        ))}
      </div>

      <div>
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Overview</h2>
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-sm)" }}>
          "Bookings/revenue generated" is measured as bookings that used a coupon within the selected
          range — the schema doesn't link bookings to a specific campaign directly.
        </p>
        <DateRangePicker onChange={(r) => setRange(r)} />
      </div>

      {loading && <LoadingState label="Loading marketing overview..." rows={3} />}
      {error && <ErrorState message={error} />}

      {!loading && !error && (
        <div className="mh-stat-grid">
          <Stat label="Active campaigns" value={activeCampaigns} />
          <Stat label="Active offers" value={activeOffers} />
          <Stat label="Coupon usage (all-time)" value={couponUsage} />
          <Stat label="Leads (range)" value={leadsCount} />
          <Stat label="Conversions (range)" value={conversions} />
          <Stat label="Coupon bookings (range)" value={bookingsGenerated} />
          <Stat label="Coupon revenue (range)" value={formatCurrencyInr(revenueGenerated)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mh-stat-card">
      <div className="mh-stat-card__value" style={{ fontSize: "var(--text-xl)" }}>{value}</div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{label}</p>
    </div>
  );
}

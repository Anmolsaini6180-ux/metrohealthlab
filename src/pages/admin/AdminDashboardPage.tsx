import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToFilteredAdminBookings, type GetAdminBookingsRequest } from "@/services/adminBookingService";
import { getTeamMembers } from "@/services/adminTeamService";
import { getAllLabs } from "@/services/adminCatalogService";
import { getTests } from "@/services/testService";
import { getPackages } from "@/services/packageService";
import { getAllTestCategories, getAllServiceAreas, getAllCoupons } from "@/services/adminCatalogService";
import { getAllReports } from "@/services/adminOpsService";
import { formatCurrencyInr } from "@/services/pricingService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import BarList from "@/components/admin/BarList";
import TrendChart from "@/components/admin/TrendChart";
import Metric from "@/components/admin/MetricCardV2";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { enumerateDays, resolveDateRange, type DateRange } from "@/utils/dateRanges";
import type { Booking } from "@/types/booking";

function shortDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

const COLLECTED_STATUSES = ["sample_collected", "received_at_lab", "testing", "report_ready", "completed"];
const STATUS_LABELS: Record<string, string> = {
  payment_pending: "Awaiting payment",
  confirmed: "Confirmed",
  assigned: "Assigned",
  on_the_way: "On the way",
  arrived: "Arrived",
  sample_collected: "Sample collected",
  received_at_lab: "Received at lab",
  testing: "Testing",
  report_ready: "Report ready",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default function AdminDashboardPage() {
  const staff = useAdminRole();
  const { role } = staff;
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("today"));
  const [filterAdminId, setFilterAdminId] = useState("");
  const [filterSubAdminId, setFilterSubAdminId] = useState("");
  const [filterAgentId, setFilterAgentId] = useState("");
  const [filterLabId, setFilterLabId] = useState("");
  const [filterBookingStatus, setFilterBookingStatus] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("");

  const admins = useAsync(() => (role === "SUPER_ADMIN" ? getTeamMembers(staff, "ADMIN") : Promise.resolve([])), [role, staff.uid]);
  const subAdmins = useAsync(() => (role === "SUPER_ADMIN" || role === "ADMIN" ? getTeamMembers(staff, "SUB_ADMIN") : Promise.resolve([])), [role, staff.uid]);
  const agents = useAsync(() => (role && role !== "COLLECTION_AGENT" ? getTeamMembers(staff, "COLLECTION_AGENT") : Promise.resolve([])), [role, staff.uid]);
  const labs = useAsync(getAllLabs, []);
  const activeTests = useAsync(() => getTests(), []);
  const activePackages = useAsync(() => getPackages(), []);
  const categories = useAsync(getAllTestCategories, []);
  const serviceAreas = useAsync(getAllServiceAreas, []);
  const coupons = useAsync(getAllCoupons, []);
  const reports = useAsync(() => getAllReports(), []);

  const query: GetAdminBookingsRequest = {
    ...range,
    filterAdminId: filterAdminId || undefined,
    filterSubAdminId: filterSubAdminId || undefined,
    filterAgentId: filterAgentId || undefined,
    filterLabId: filterLabId || undefined,
    filterBookingStatus: filterBookingStatus || undefined,
    filterPaymentStatus: filterPaymentStatus || undefined,
  };
  // Live: a booking created, reassigned, paid, or moved to a new status
  // by anyone — website, WhatsApp, or another admin — updates these
  // figures immediately instead of only on the next manual refresh.
  const bookings = useRealtimeQuery<Booking[]>(
    (onData, onError) => subscribeToFilteredAdminBookings(query, (r) => onData(r.bookings), onError),
    [range.startDate, range.endDate, filterAdminId, filterSubAdminId, filterAgentId, filterLabId, filterBookingStatus, filterPaymentStatus]
  );

  const stats = useMemo(() => {
    const b = bookings.data ?? [];
    return {
      total: b.length,
      completed: b.filter((x) => x.bookingStatus === "completed").length,
      pending: b.filter((x) => x.bookingStatus === "payment_pending" || x.bookingStatus === "confirmed").length,
      cancelled: b.filter((x) => x.bookingStatus === "cancelled" || x.bookingStatus === "refunded").length,
      // Cash on home only: "revenue" is what has actually been
      // collected in hand, not a paid/unpaid online-gateway split.
      cashCollected: b.reduce((sum, x) => sum + (x.amountReceived ?? 0), 0),
      cashPending: b.reduce((sum, x) => sum + (x.pendingAmount ?? 0), 0),
      customers: new Set(b.map((x) => x.userId)).size,
      collections: b.filter((x) => COLLECTED_STATUSES.includes(x.bookingStatus)).length,
      reportsReady: b.filter((x) => x.bookingStatus === "report_ready").length,
    };
  }, [bookings.data]);

  // Zero-filled across every real day in the selected range (not just
  // days that happen to have a booking) so the trend chart shows
  // genuine gaps instead of silently compressing a sparse month into
  // what looks like a busy consecutive run of days.
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings.data ?? []) map.set(b.date, (map.get(b.date) ?? 0) + 1);
    return enumerateDays(range.startDate, range.endDate).map((day) => ({ x: shortDayLabel(day), y: map.get(day) ?? 0 }));
  }, [bookings.data, range.startDate, range.endDate]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings.data ?? []) map.set(b.bookingStatus, (map.get(b.bookingStatus) ?? 0) + 1);
    return [...map.entries()].map(([status, value]) => ({ label: STATUS_LABELS[status] ?? status, value }));
  }, [bookings.data]);

  const topTests = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings.data ?? []) {
      for (const item of b.items) {
        if (item.itemType === "test") map.set(item.name, (map.get(item.name) ?? 0) + 1);
      }
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [bookings.data]);

  const topPackages = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings.data ?? []) {
      for (const item of b.items) {
        if (item.itemType === "package") map.set(item.name, (map.get(item.name) ?? 0) + 1);
      }
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [bookings.data]);

  // Carries this dashboard's own selected date range along so "Pending"
  // means the same set of bookings on both screens — AdminBookingsPage
  // seeds its query from these params, though its DateRangePicker
  // widget itself still shows its own default preset highlighted
  // (a cosmetic gap: the picker has no prop for an initial value; the
  // underlying filtered data is correct regardless).
  function bookingsLink(status?: string): string {
    const params = new URLSearchParams({ start: range.startDate, end: range.endDate });
    if (status) params.set("status", status);
    return `/admin/bookings?${params.toString()}`;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="mh-page-head">
        <div>
          <h1 className="mh2-admin-page-title" style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Signed in as {role}. All figures below are scoped to your team and the selected filters, and update live.
          </p>
        </div>
      </div>

      <DateRangePicker onChange={(r) => setRange(r)} />

      <div className="mh-filter-row">
        {role === "SUPER_ADMIN" && admins.data && admins.data.length > 0 && (
          <FilterSelect label="Admin" value={filterAdminId} onChange={setFilterAdminId} options={admins.data.map((a) => ({ value: a.uid, label: a.name }))} />
        )}
        {(role === "SUPER_ADMIN" || role === "ADMIN") && subAdmins.data && subAdmins.data.length > 0 && (
          <FilterSelect label="Sub Admin" value={filterSubAdminId} onChange={setFilterSubAdminId} options={subAdmins.data.map((a) => ({ value: a.uid, label: a.name }))} />
        )}
        {role !== "COLLECTION_AGENT" && agents.data && agents.data.length > 0 && (
          <FilterSelect label="Collection Agent" value={filterAgentId} onChange={setFilterAgentId} options={agents.data.map((a) => ({ value: a.uid, label: a.name }))} />
        )}
        {labs.data && labs.data.length > 0 && (
          <FilterSelect label="Lab" value={filterLabId} onChange={setFilterLabId} options={labs.data.map((l) => ({ value: l.id, label: l.name }))} />
        )}
        <FilterSelect label="Status" value={filterBookingStatus} onChange={setFilterBookingStatus} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        <FilterSelect label="Payment" value={filterPaymentStatus} onChange={setFilterPaymentStatus} options={["pending", "processing", "success", "failed", "refunded", "cash_pending"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
      </div>

      {bookings.loading && <LoadingState label="Loading dashboard..." rows={3} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}

      {bookings.data && (
        <>
          <div className="mh2-dash-section">
            <p className="mh2-dash-section__title">Bookings — selected range</p>
            <div className="mh2-metric-grid">
              <Metric icon="calendar_month" label="Total bookings" value={stats.total} to={bookingsLink()} />
              <Metric icon="check_circle" label="Completed" value={stats.completed} to={bookingsLink("completed")} tone="success" />
              <Metric icon="hourglass_top" label="Pending" value={stats.pending} to={bookingsLink("payment_pending,confirmed")} tone="warning" />
              <Metric icon="cancel" label="Cancelled" value={stats.cancelled} to={bookingsLink("cancelled,refunded")} tone="danger" />
              <Metric icon="group" label="Customers" value={stats.customers} />
              <Metric icon="local_shipping" label="Collections done" value={stats.collections} />
              <Metric icon="description" label="Reports ready" value={stats.reportsReady} to={bookingsLink("report_ready")} tone="accent" />
            </div>
          </div>

          <div className="mh2-dash-section">
            <p className="mh2-dash-section__title">Cash on Home</p>
            <div className="mh2-metric-grid">
              <Metric icon="payments" label="Cash collected" value={formatCurrencyInr(stats.cashCollected)} tone="success" />
              <Metric icon="account_balance_wallet" label="Cash pending" value={formatCurrencyInr(stats.cashPending)} tone="warning" />
            </div>
          </div>

          <div className="mh2-dash-section">
            <p className="mh2-dash-section__title">Analytics</p>
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div className="mh2-admin-card">
                <div className="mh2-chart-card__head">
                  <span className="mi" aria-hidden="true">trending_up</span>
                  <h3>Bookings trend</h3>
                </div>
                <TrendChart series={[{ label: "Bookings", color: "var(--color-primary)", data: bookingsByDay }]} />
              </div>
              <div className="mh2-admin-card">
                <div className="mh2-chart-card__head">
                  <span className="mi" aria-hidden="true">donut_large</span>
                  <h3>Status breakdown</h3>
                </div>
                <BarList items={statusBreakdown} />
              </div>
              <div className="mh2-admin-card">
                <div className="mh2-chart-card__head">
                  <span className="mi" aria-hidden="true">science</span>
                  <h3>Top tests</h3>
                </div>
                <BarList items={topTests} />
              </div>
              <div className="mh2-admin-card">
                <div className="mh2-chart-card__head">
                  <span className="mi" aria-hidden="true">inventory_2</span>
                  <h3>Top packages</h3>
                </div>
                <BarList items={topPackages} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Catalog counters read straight from Supabase and stay useful
          even if the booking analytics above are still loading — kept
          quiet/muted since they're reference counts, not today's
          activity, so they don't compete with the numbers above. */}
      <div className="mh2-dash-section">
        <p className="mh2-dash-section__title">Catalog</p>
        <div className="mh2-metric-grid">
          <Metric icon="science" label="Active tests" value={activeTests.data?.length ?? (activeTests.loading ? "…" : 0)} to="/admin/tests" muted />
          <Metric icon="inventory_2" label="Active packages" value={activePackages.data?.length ?? (activePackages.loading ? "…" : 0)} to="/admin/packages" muted />
          <Metric icon="category" label="Categories" value={categories.data?.length ?? (categories.loading ? "…" : 0)} to="/admin/categories" muted />
          <Metric icon="storefront" label="Labs" value={labs.data?.length ?? (labs.loading ? "…" : 0)} to="/admin/labs" muted />
          <Metric icon="location_on" label="Service areas" value={serviceAreas.data?.length ?? (serviceAreas.loading ? "…" : 0)} to="/admin/service-areas" muted />
          <Metric icon="confirmation_number" label="Active coupons" value={coupons.data?.filter((c) => c.active).length ?? (coupons.loading ? "…" : 0)} to="/admin/marketing/coupons" muted />
          <Metric icon="summarize" label="Reports filed" value={reports.data?.length ?? (reports.loading ? "…" : 0)} to="/admin/reports" muted />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: all</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

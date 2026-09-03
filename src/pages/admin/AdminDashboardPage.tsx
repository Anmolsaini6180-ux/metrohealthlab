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
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import type { Booking } from "@/types/booking";

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

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings.data ?? []) map.set(b.date, (map.get(b.date) ?? 0) + 1);
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  }, [bookings.data]);

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

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
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

      {/* Catalog counters read straight from Supabase and stay useful
          even if the booking analytics below are still loading. */}
      <div className="mh-stat-grid">
        <Stat label="Active tests" value={activeTests.data?.length ?? (activeTests.loading ? "…" : 0)} />
        <Stat label="Active packages" value={activePackages.data?.length ?? (activePackages.loading ? "…" : 0)} />
        <Stat label="Categories" value={categories.data?.length ?? (categories.loading ? "…" : 0)} />
        <Stat label="Labs" value={labs.data?.length ?? (labs.loading ? "…" : 0)} />
        <Stat label="Service areas" value={serviceAreas.data?.length ?? (serviceAreas.loading ? "…" : 0)} />
        <Stat label="Active coupons" value={coupons.data?.filter((c) => c.active).length ?? (coupons.loading ? "…" : 0)} />
        <Stat label="Cash collected" value={bookings.data ? formatCurrencyInr(stats.cashCollected) : "…"} />
        <Stat label="Cash pending" value={bookings.data ? formatCurrencyInr(stats.cashPending) : "…"} />
        <Stat label="Reports filed" value={reports.data?.length ?? (reports.loading ? "…" : 0)} />
      </div>

      {bookings.loading && <LoadingState label="Loading dashboard..." rows={3} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}

      {bookings.data && (
        <>
          <div className="mh-stat-grid">
            <Stat label="Total bookings" value={stats.total} />
            <Stat label="Completed" value={stats.completed} />
            <Stat label="Pending" value={stats.pending} />
            <Stat label="Cancelled" value={stats.cancelled} />
            <Stat label="Customers" value={stats.customers} />
            <Stat label="Collections done" value={stats.collections} />
            <Stat label="Reports ready" value={stats.reportsReady} />
            <Stat label="Active tests" value={activeTests.data?.length ?? (activeTests.loading ? "…" : 0)} />
            <Stat label="Active packages" value={activePackages.data?.length ?? (activePackages.loading ? "…" : 0)} />
          </div>

          <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div className="card">
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Bookings trend</h3>
              <BarList items={bookingsByDay} />
            </div>
            <div className="card">
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Status breakdown</h3>
              <BarList items={statusBreakdown} />
            </div>
            <div className="card">
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Top tests</h3>
              <BarList items={topTests} />
            </div>
            <div className="card">
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Top packages</h3>
              <BarList items={topPackages} />
            </div>
          </div>
        </>
      )}
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mh-stat-card">
      <div className="mh-stat-card__value" style={{ fontSize: "var(--text-xl)" }}>{value}</div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{label}</p>
    </div>
  );
}

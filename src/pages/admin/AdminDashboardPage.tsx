import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { getAdminBookings, type GetAdminBookingsRequest } from "@/services/adminBookingService";
import { getTeamMembers } from "@/services/adminTeamService";
import { getAllLabs } from "@/services/adminCatalogService";
import { getTests } from "@/services/testService";
import { getPackages } from "@/services/packageService";
import { seedStarterCatalog } from "@/services/adminSeedService";
import { formatCurrencyInr } from "@/services/pricingService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import BarList from "@/components/admin/BarList";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

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
  const { role } = useAdminRole();
  const { showToast } = useToast();
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("today"));
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [filterAdminId, setFilterAdminId] = useState("");
  const [filterSubAdminId, setFilterSubAdminId] = useState("");
  const [filterAgentId, setFilterAgentId] = useState("");
  const [filterLabId, setFilterLabId] = useState("");
  const [filterBookingStatus, setFilterBookingStatus] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("");

  const admins = useAsync(() => (role === "SUPER_ADMIN" ? getTeamMembers("ADMIN") : Promise.resolve([])), [role]);
  const subAdmins = useAsync(() => (role === "SUPER_ADMIN" || role === "ADMIN" ? getTeamMembers("SUB_ADMIN") : Promise.resolve([])), [role]);
  const agents = useAsync(() => (role !== "COLLECTION_AGENT" ? getTeamMembers("COLLECTION_AGENT") : Promise.resolve([])), [role]);
  const labs = useAsync(getAllLabs, []);
  const activeTests = useAsync(() => getTests(), []);
  const activePackages = useAsync(() => getPackages(), []);

  const query: GetAdminBookingsRequest = {
    ...range,
    filterAdminId: filterAdminId || undefined,
    filterSubAdminId: filterSubAdminId || undefined,
    filterAgentId: filterAgentId || undefined,
    filterLabId: filterLabId || undefined,
    filterBookingStatus: filterBookingStatus || undefined,
    filterPaymentStatus: filterPaymentStatus || undefined,
  };
  const bookings = useAsync(() => getAdminBookings(query).then((r) => r.bookings), [
    range.startDate, range.endDate, filterAdminId, filterSubAdminId, filterAgentId, filterLabId, filterBookingStatus, filterPaymentStatus,
  ]);

  const stats = useMemo(() => {
    const b = bookings.data ?? [];
    return {
      total: b.length,
      completed: b.filter((x) => x.bookingStatus === "completed").length,
      pending: b.filter((x) => x.bookingStatus === "payment_pending" || x.bookingStatus === "confirmed").length,
      cancelled: b.filter((x) => x.bookingStatus === "cancelled" || x.bookingStatus === "refunded").length,
      revenue: b.filter((x) => x.paymentStatus === "success").reduce((sum, x) => sum + x.finalAmount, 0),
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

  async function handleConfirmSeed() {
    setSeeding(true);
    setSeedError(null);
    try {
      const result = await seedStarterCatalog();
      showToast(
        `Imported ${result.testsCreated} tests, ${result.packagesCreated} packages, ${result.categoriesCreated} categories, ${result.labsCreated} labs, ${result.serviceAreasCreated} service areas, ${result.slotsCreated} slots, ${result.articlesCreated} articles, ${result.offersCreated} offers, ${result.bannersCreated} banners, ${result.couponsCreated} coupons.`
      );
      setSeeded(true);
      setShowSeedConfirm(false);
    } catch (err) {
      setSeedError(toUserMessage(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
          Signed in as {role}. All figures below are scoped to your team and the selected filters.
        </p>
      </div>

      {role === "SUPER_ADMIN" && !seeded && (
        <div className="card" style={{ background: "var(--color-bg-tint)" }}>
          <p style={{ fontWeight: 600 }}>Import your starter catalog</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
            One-time import of your real labs, tests, packages, categories, banners, and coupons — the
            content already in your product reference. This can only run once; after that, every
            change goes through the admin pages below like normal.
          </p>
          {seedError && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: 6 }}>{seedError}</p>}
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowSeedConfirm(true)}>
            Import starter catalog
          </button>
        </div>
      )}

      <DateRangePicker onChange={(r) => setRange(r)} />

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
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
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <Stat label="Total bookings" value={stats.total} />
            <Stat label="Completed" value={stats.completed} />
            <Stat label="Pending" value={stats.pending} />
            <Stat label="Cancelled" value={stats.cancelled} />
            <Stat label="Revenue (collected)" value={formatCurrencyInr(stats.revenue)} />
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
      {showSeedConfirm && (
        <ConfirmDialog
          title="Import starter catalog?"
          message="This adds your real labs, tests, packages, categories, banners, and coupons to Firestore. It can only run once."
          confirmLabel="Import"
          busy={seeding}
          onConfirm={handleConfirmSeed}
          onCancel={() => setShowSeedConfirm(false)}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
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

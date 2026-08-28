import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { getAdminBookings, type GetAdminBookingsRequest } from "@/services/adminBookingService";
import { getTeamMembers } from "@/services/adminTeamService";
import { getAllLabs } from "@/services/adminCatalogService";
import { getTests } from "@/services/testService";
import { getPackages } from "@/services/packageService";
import { getStarterCatalogState, seedStarterCatalog, type SeedProgress } from "@/services/adminSeedService";
import { formatCurrencyInr } from "@/services/pricingService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import BarList from "@/components/admin/BarList";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { CALLABLE_UNAVAILABLE_MESSAGE, logOperationError, toUserMessage } from "@/utils/errors";
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
  const staff = useAdminRole();
  const { role } = staff;
  const { showToast } = useToast();
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("today"));
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null);
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
  // Real database state, so the import offer is made against facts
  // rather than a guess about whether anything is there already.
  const catalogState = useAsync(
    () => (role === "SUPER_ADMIN" ? getStarterCatalogState() : Promise.resolve(null)),
    [role]
  );

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

  // A callable that isn't deployed comes back as the bare code
  // "internal". Distinguish that from a real query failure so the page
  // can explain the cause instead of printing the word.
  const bookingsUnavailable = bookings.error === CALLABLE_UNAVAILABLE_MESSAGE;

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
    setSeedProgress(null);
    try {
      const result = await seedStarterCatalog(staff.uid, setSeedProgress);
      const created =
        result.categoriesCreated + result.labsCreated + result.testsCreated + result.packagesCreated +
        result.labPricingCreated + result.bannersCreated + result.couponsCreated +
        result.serviceAreasCreated + result.slotsCreated + result.articlesCreated + result.offersCreated;
      showToast(
        created === 0
          ? `Everything was already imported — ${result.skippedExisting} existing documents left untouched.`
          : `Imported ${created} documents (${result.testsCreated} tests, ${result.packagesCreated} packages, ${result.categoriesCreated} categories, ${result.labsCreated} labs, ${result.serviceAreasCreated} service areas, ${result.slotsCreated} slots)${result.skippedExisting > 0 ? `, and left ${result.skippedExisting} existing documents untouched` : ""}.`
      );
      setSeeded(true);
      setShowSeedConfirm(false);
      // The catalog counters on this page read from those collections.
      catalogState.retry();
      labs.retry();
      activeTests.retry();
      activePackages.retry();
    } catch (err) {
      logOperationError("starter catalog import", err, { actorUid: staff.uid });
      setSeedError(toUserMessage(err));
    } finally {
      setSeeding(false);
      setSeedProgress(null);
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
            Imports your labs, tests, packages, categories, service areas, bookable slots, banners,
            coupons, articles and offers. Safe to run more than once — every document has a fixed id,
            so anything already present is skipped rather than duplicated or overwritten.
          </p>

          {catalogState.loading && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>Checking what is already in the database…</p>
          )}
          {catalogState.error && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
              Could not read current catalog state ({catalogState.error}). The import is still safe to run — it skips existing records.
            </p>
          )}
          {catalogState.data && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
              {catalogState.data.hasExistingData
                ? `Already in the database: ${Object.entries(catalogState.data.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ")}. ${catalogState.data.completed ? "A previous import was marked complete." : "No completed import is recorded — running this will fill in whatever is missing."}`
                : "No catalog data found yet — this will populate the whole site."}
            </p>
          )}

          {seeding && seedProgress && (
            <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginTop: 6 }}>
              Importing {seedProgress.step}… (step {seedProgress.done} of {seedProgress.total})
            </p>
          )}
          {seedError && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: 6 }}>{seedError}</p>}

          <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={seeding} onClick={() => setShowSeedConfirm(true)}>
            {seeding ? "Importing…" : catalogState.data?.hasExistingData ? "Import missing catalog data" : "Import starter catalog"}
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

      {/* Catalog counters come straight from Firestore and stay useful
          even when the booking analytics below cannot load. */}
      <div className="mh-stat-grid">
        <Stat label="Active tests" value={activeTests.data?.length ?? (activeTests.loading ? "…" : 0)} />
        <Stat label="Active packages" value={activePackages.data?.length ?? (activePackages.loading ? "…" : 0)} />
        <Stat label="Labs" value={labs.data?.length ?? (labs.loading ? "…" : 0)} />
      </div>

      {bookings.loading && <LoadingState label="Loading dashboard..." rows={3} />}
      {bookings.error && !bookingsUnavailable && <ErrorState message={bookings.error} onRetry={bookings.retry} />}
      {bookingsUnavailable && (
        <div className="card">
          <p style={{ fontWeight: 600 }}>Booking analytics are unavailable on this project</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
            Booking figures are served by a Cloud Function (<code>getAdminBookings</code>) that is not
            deployed — this Firebase project is on the Spark plan, which cannot host Cloud Functions.
            Firestore security rules also deliberately forbid listing bookings from a browser, so this
            cannot be recalculated client-side without changing the security model. Everything above
            and every catalog page in the sidebar is unaffected.
          </p>
        </div>
      )}

      {bookings.data && (
        <>
          <div className="mh-stat-grid">
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

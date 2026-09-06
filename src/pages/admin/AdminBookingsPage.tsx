import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { assignBooking, getAdminBookings, getBookingStatusHistory, updateBookingStatus } from "@/services/adminBookingService";
import { getTeamMembers } from "@/services/adminTeamService";
import { formatCurrencyInr } from "@/services/pricingService";
import { computeMargin } from "@/utils/margin";
import type { Booking, BookingStatus } from "@/types/booking";
import DateRangePicker from "@/components/admin/DateRangePicker";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import StatusBadge from "@/components/admin/StatusBadge";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

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

// Matches the buckets AdminDashboardPage's own "Pending"/"Cancelled"
// stat cards compute (neither is a single real booking_status) — one
// dropdown entry and one shareable ?status= value per bucket, rather
// than inventing a status the database doesn't have.
const STATUS_GROUPS: { value: string; label: string }[] = [
  { value: "payment_pending,confirmed", label: "Pending (awaiting payment + confirmed)" },
  { value: "cancelled,refunded", label: "Cancelled + refunded" },
];

const PRIVILEGED = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];

export default function AdminBookingsPage() {
  const staff = useAdminRole();
  const { role } = staff;
  const { showToast } = useToast();
  // Seeded from ?status=/?start=/?end= so a link like
  // /admin/bookings?status=pending (or a comma-joined group, e.g.
  // payment_pending,confirmed) lands pre-filtered — the click-through
  // target for AdminDashboardPage's stat cards. statusFilter is kept
  // in sync with the URL both ways: changing the dropdown updates the
  // querystring too, so the filtered view stays shareable/bookmarkable
  // and survives a page reload. The date range is read once on
  // mount only — DateRangePicker owns its own preset state after
  // that and has no prop to keep re-syncing it from outside.
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<DateRange>(() => {
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    return start && end ? { startDate: start, endDate: end } : resolveDateRange("today");
  });
  const [statusFilter, setStatusFilterState] = useState<string>(searchParams.get("status") ?? "");
  // Seeded from the URL too, e.g. Team Performance's own "jump to this
  // exact booking" links (?search=<reference>) — previously those
  // links could only filter by status, landing an admin on a whole
  // list of same-status bookings instead of the one they clicked.

  function setStatusFilter(value: string) {
    setStatusFilterState(value);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("status", value);
        else next.delete("status");
        return next;
      },
      { replace: true }
    );
  }

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Every status change is confirmed — not just cancel/refund — and
  // the dialog always names the REAL from/to statuses actually
  // selected rather than a hardcoded "cancelled" (a real bug caught
  // earlier while this only handled the two terminal statuses: it
  // would have been silently wrong the moment a third status flowed
  // through the same dialog).
  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; reference: string; from: BookingStatus; to: BookingStatus } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Client-side, over whatever the date/status filters above already
  // fetched — a real search over the same real data, not a second
  // query. Matches booking id, customer name, phone, or item name.
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");

  const bookings = useAsync(
    () =>
      getAdminBookings({
        ...range,
        filterBookingStatus: statusFilter ? (statusFilter.includes(",") ? statusFilter.split(",") : statusFilter) : undefined,
      }),
    [range.startDate, range.endDate, statusFilter]
  );
  const agents = useAsync(
    () => (role && PRIVILEGED.includes(role) ? getTeamMembers(staff, "COLLECTION_AGENT") : Promise.resolve([])),
    [role, staff.uid]
  );

  async function handleAssign(bookingId: string, agentUid: string) {
    if (!agentUid) return;
    setBusyId(bookingId);
    setActionError(null);
    try {
      await assignBooking(bookingId, agentUid);
      showToast("Collector assigned.");
      bookings.retry();
    } catch (err) {
      setActionError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmStatusChange() {
    if (!pendingStatusChange) return;
    const { id, to } = pendingStatusChange;
    setBusyId(id);
    setActionError(null);
    try {
      await updateBookingStatus(id, to);
      showToast(`Booking marked ${STATUS_LABELS[to] ?? to}.`);
      setPendingStatusChange(null);
      bookings.retry();
    } catch (err) {
      setActionError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const isPrivileged = !!role && PRIVILEGED.includes(role);
  // Margin/TP visibility matches the SAME roles that can already edit
  // catalog pricing (can_manage_catalog() server-side) — not the wider
  // PRIVILEGED set above, which also includes SUB_ADMIN for booking
  // operations. Internal cost is a narrower need-to-know than "can
  // change a booking's status."
  const canSeeMargin = role === "SUPER_ADMIN" || role === "ADMIN";

  const visibleBookings = useMemo(() => {
    const all = bookings.data?.bookings ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.reference.toLowerCase().includes(q) ||
        (b.contact?.name ?? "").toLowerCase().includes(q) ||
        (b.contact?.phone ?? "").includes(q) ||
        b.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [bookings.data, search]);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Bookings</h1>

      <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)", flexWrap: "wrap", alignItems: "center" }}>
        <DateRangePicker onChange={(r) => setRange(r)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 260, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">All statuses</option>
          {STATUS_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {statusFilter && (
          <button className="btn btn-outline" onClick={() => setStatusFilter("")}>
            Clear status filter
          </button>
        )}
        <input
          type="search"
          placeholder="Search booking ID, customer, phone, or test/package"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
        />
      </div>

      {actionError && <ErrorState message={actionError} />}
      {bookings.loading && <LoadingState label="Loading bookings..." rows={4} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}
      {bookings.data && visibleBookings.length === 0 && (
        <EmptyState
          icon="calendar_month"
          title={search ? "No bookings match your search" : "No bookings in this range"}
        />
      )}

      {bookings.data && visibleBookings.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {visibleBookings.map((b) => {
            const canAdvance = isPrivileged || (role === "COLLECTION_AGENT" && b.assignedAgentId);
            return (
              <div key={b.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{b.reference}</p>
                    <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{b.items.map((i) => i.name).join(", ")}</p>
                    <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.date} • {b.collectionType}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 600 }}>{formatCurrencyInr(b.finalAmount)}</p>
                    <div style={{ margin: "4px 0" }}><StatusBadge status={b.bookingStatus} /></div>
                    <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.paymentStatus.replace(/_/g, " ")}</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn btn-outline" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                    {expandedId === b.id ? "Hide details" : "Details"}
                  </button>
                  {b.bookingStatus === "confirmed" && isPrivileged && (
                    <select
                      defaultValue=""
                      disabled={busyId === b.id}
                      onChange={(e) => handleAssign(b.id, e.target.value)}
                      style={{ padding: 6, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
                    >
                      <option value="" disabled>Assign agent...</option>
                      {(agents.data ?? []).map((a) => (
                        <option key={a.uid} value={a.uid}>{a.name}</option>
                      ))}
                    </select>
                  )}
                  {canAdvance && !["completed", "cancelled", "refunded"].includes(b.bookingStatus) && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)" }}>
                      Status:
                      <select
                        value={b.bookingStatus}
                        disabled={busyId === b.id}
                        onChange={(e) => {
                          const value = e.target.value as BookingStatus;
                          if (value === b.bookingStatus) return;
                          setPendingStatusChange({ id: b.id, reference: b.reference, from: b.bookingStatus, to: value });
                        }}
                        style={{ padding: 6, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
                      >
                        {Object.entries(STATUS_LABELS)
                          .filter(([value]) => value === b.bookingStatus || !["cancelled", "refunded"].includes(value) || isPrivileged)
                          .map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                      </select>
                    </label>
                  )}
                  {["completed", "cancelled", "refunded"].includes(b.bookingStatus) && (
                    <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                      {STATUS_LABELS[b.bookingStatus]} — no further status changes.
                    </span>
                  )}
                </div>

                {expandedId === b.id && <BookingDetailPanel booking={b} canSeeMargin={canSeeMargin} />}
              </div>
            );
          })}
          {bookings.data.truncated && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              Showing the first 500 results — narrow the date range or status filter to see more precisely.
            </p>
          )}
        </div>
      )}
      {pendingStatusChange && (
        <ConfirmDialog
          title={`Change booking ${pendingStatusChange.reference} from ${STATUS_LABELS[pendingStatusChange.from] ?? pendingStatusChange.from} to ${STATUS_LABELS[pendingStatusChange.to] ?? pendingStatusChange.to}?`}
          message={
            ["cancelled", "refunded"].includes(pendingStatusChange.to)
              ? "This can't be undone from here — the customer will be notified."
              : "The customer will be notified and their tracker will update immediately."
          }
          confirmLabel={`Mark ${STATUS_LABELS[pendingStatusChange.to] ?? pendingStatusChange.to}`}
          busy={busyId === pendingStatusChange.id}
          onConfirm={handleConfirmStatusChange}
          onCancel={() => setPendingStatusChange(null)}
        />
      )}
    </div>
  );
}

function formatWhen(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Full detail for one booking — everything the flat list row above
 * doesn't have room for: contact/address, per-item pricing (with TP/
 * margin gated to canSeeMargin), notes, assigned staff ids, and the
 * real status-change history. Fetches its own history lazily (only
 * when actually expanded) rather than the parent list prefetching it
 * for every row up front.
 */
function BookingDetailPanel({ booking: b, canSeeMargin }: { booking: Booking; canSeeMargin: boolean }) {
  const history = useAsync(() => getBookingStatusHistory(b.id), [b.id]);

  const itemsTp = b.items.every((i) => i.tp == null) ? null : b.items.reduce((sum, i) => sum + (i.tp ?? 0), 0);
  const bookingMargin = canSeeMargin ? computeMargin(b.subtotal, itemsTp) : null;

  return (
    <div style={{ marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: "1px solid var(--color-line)", display: "grid", gap: "var(--space-sm)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-sm)", fontSize: "var(--text-sm)" }}>
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Customer</p>
          <p>{b.contact?.name ?? "—"}</p>
          {b.contact?.phone ? (
            <a href={`tel:${b.contact.phone.replace(/[^\d+]/g, "")}`} className="text-soft">
              <span className="mi" aria-hidden="true" style={{ fontSize: 14, verticalAlign: "middle" }}>call</span> {b.contact.phone}
            </a>
          ) : (
            <p className="text-soft">—</p>
          )}
        </div>
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Address</p>
          <p>{b.contact?.address ?? (b.collectionType === "home" ? "(saved address on file)" : "Center visit — no address")}</p>
        </div>
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Payment</p>
          <p>{(b.paymentMethod ?? "cash_on_home").replace(/_/g, " ")} • {b.paymentStatus.replace(/_/g, " ")}</p>
          <p className="text-soft">Received {formatCurrencyInr(b.amountReceived ?? 0)} of {formatCurrencyInr(b.finalAmount)}</p>
        </div>
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Assigned staff</p>
          <p className="text-soft">
            {[
              b.assignedAdminId && `Admin: ${b.assignedAdminId}`,
              b.assignedSubAdminId && `Sub-admin: ${b.assignedSubAdminId}`,
              b.assignedAgentId && `Agent: ${b.assignedAgentId}`,
            ]
              .filter(Boolean)
              .join(" • ") || "Unassigned"}
          </p>
        </div>
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Created</p>
          <p>{formatWhen(b.createdAt)}</p>
        </div>
      </div>

      {b.notes && (
        <div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Instructions / notes</p>
          <p style={{ fontSize: "var(--text-sm)" }}>{b.notes}</p>
        </div>
      )}

      <div>
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: 4 }}>Items</p>
        <div style={{ display: "grid", gap: 4 }}>
          {b.items.map((item, idx) => {
            const margin = canSeeMargin ? computeMargin(item.price, item.tp) : null;
            return (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", gap: 8 }}>
                <span>{item.name} <span className="text-soft">({item.itemType})</span></span>
                <span className="text-soft">
                  {formatCurrencyInr(item.price)}
                  {canSeeMargin && (
                    <> • TP {item.tp != null ? formatCurrencyInr(item.tp) : "not set"}
                      {margin && ` • Margin ${formatCurrencyInr(margin.amount)}${margin.percent != null ? ` (${margin.percent.toFixed(0)}%)` : ""}`}
                    </>
                  )}
                </span>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", fontWeight: 600, marginTop: 4, paddingTop: 4, borderTop: "1px dashed var(--color-line)" }}>
            <span>Subtotal {formatCurrencyInr(b.subtotal)} + collection {formatCurrencyInr(b.collectionFee)} − discount {formatCurrencyInr(b.discount)}</span>
            <span>{formatCurrencyInr(b.finalAmount)}</span>
          </div>
          {canSeeMargin && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              {itemsTp == null
                ? "Gross margin: TP not set on one or more items"
                : `Gross margin (items only, excludes collection fee): ${formatCurrencyInr(bookingMargin!.amount)}${bookingMargin!.percent != null ? ` (${bookingMargin!.percent.toFixed(0)}%)` : ""}`}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: 4 }}>Status history</p>
        {history.loading && !history.data && <LoadingState rows={2} />}
        {history.error && <ErrorState message={history.error} onRetry={history.retry} />}
        {history.data && history.data.length === 0 && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No history recorded.</p>}
        {history.data && history.data.length > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            {history.data.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", gap: 8 }}>
                <span>
                  <StatusBadge status={h.status} /> {h.note && <span className="text-soft">— {h.note}</span>}
                </span>
                <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{formatWhen(h.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

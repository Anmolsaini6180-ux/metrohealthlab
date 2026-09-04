import { useMemo, useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { getTeamPerformance } from "@/services/adminPerformanceService";
import { getAdminBookings } from "@/services/adminBookingService";
import { formatCurrencyInr } from "@/services/pricingService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import StatusBadge from "@/components/admin/StatusBadge";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";

export default function AdminTeamPerformancePage() {
  const { role } = useAdminRole();
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const result = useAsync(() => getTeamPerformance(range.startDate, range.endDate), [range.startDate, range.endDate]);
  const [staffFilter, setStaffFilter] = useState("");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  const sorted = useMemo(
    () => (result.data?.performance ?? []).slice().sort((a, b) => b.assigned - a.assigned),
    [result.data]
  );
  const visible = staffFilter ? sorted.filter((p) => p.uid === staffFilter) : sorted;

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>
        Team performance
      </h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        {role === "COLLECTION_AGENT" ? "Your own performance" : "Scoped to your team"} — bookings created in the selected range, capped at 2,000 for this view.
      </p>

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <DateRangePicker onChange={(r) => setRange(r)} />
        {sorted.length > 1 && (
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
            <option value="">All staff</option>
            {sorted.map((p) => (
              <option key={p.uid} value={p.uid}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        {result.loading && <LoadingState label="Loading performance..." rows={3} />}
        {result.error && <ErrorState message={result.error} onRetry={result.retry} />}
        {result.data && visible.length === 0 && (
          <EmptyState icon="insights" title="No performance data for this range" />
        )}
        {result.data && visible.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {visible.map((p) => (
              <div key={p.uid} className="card">
                <button
                  type="button"
                  onClick={() => setExpandedUid(expandedUid === p.uid ? null : p.uid)}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontWeight: 600 }}>
                      {p.name} <span className="mi" aria-hidden="true" style={{ fontSize: 16, verticalAlign: "middle" }}>{expandedUid === p.uid ? "expand_less" : "expand_more"}</span>
                    </p>
                    <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>{p.completionRate}% completion</span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-md)", marginTop: 6, flexWrap: "wrap" }}>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Assigned: {p.assigned}</span>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Completed: {p.completed}</span>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Pending: {p.pending}</span>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Cancelled: {p.cancelled}</span>
                  </div>
                </button>
                {expandedUid === p.uid && <StaffBookingsList agentUid={p.uid} range={range} />}
              </div>
            ))}
          </div>
        )}
        {result.data?.truncated && (
          <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-sm)" }}>
            Showing the first 2,000 bookings in range — narrow the date range for a fully precise count.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The real bookings behind one staff member's summary numbers above —
 * fetched fresh via the same assigned_agent_id relationship
 * getTeamPerformance aggregated from, not a client-side re-slice of
 * data that's already been reduced to counts.
 */
function StaffBookingsList({ agentUid, range }: { agentUid: string; range: DateRange }) {
  const bookings = useAsync(() => getAdminBookings({ ...range, filterAgentId: agentUid }), [agentUid, range.startDate, range.endDate]);

  return (
    <div style={{ marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: "1px solid var(--color-line)" }}>
      {bookings.loading && <LoadingState rows={2} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}
      {bookings.data && bookings.data.bookings.length === 0 && (
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No bookings assigned in this range.</p>
      )}
      {bookings.data && bookings.data.bookings.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {bookings.data.bookings.map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", gap: 8, flexWrap: "wrap" }}>
              <span>{b.id} — {b.items.map((i) => i.name).join(", ")}</span>
              <span className="text-soft">{b.date} • {formatCurrencyInr(b.finalAmount)} • <StatusBadge status={b.bookingStatus} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

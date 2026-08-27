import { useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { getTeamPerformance } from "@/services/adminPerformanceService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";

export default function AdminTeamPerformancePage() {
  const { role } = useAdminRole();
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const result = useAsync(() => getTeamPerformance(range.startDate, range.endDate), [range.startDate, range.endDate]);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>
        Team performance
      </h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        {role === "COLLECTION_AGENT" ? "Your own performance" : "Scoped to your team"} — bookings created in the selected range, capped at 2,000 for this view.
      </p>

      <DateRangePicker onChange={(r) => setRange(r)} />

      <div style={{ marginTop: "var(--space-md)" }}>
        {result.loading && <LoadingState label="Loading performance..." rows={3} />}
        {result.error && <ErrorState message={result.error} onRetry={result.retry} />}
        {result.data && result.data.performance.length === 0 && (
          <EmptyState icon="insights" title="No performance data for this range" />
        )}
        {result.data && result.data.performance.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {result.data.performance
              .sort((a, b) => b.assigned - a.assigned)
              .map((p) => (
                <div key={p.uid} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontWeight: 600 }}>{p.name}</p>
                    <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>{p.completionRate}% completion</span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-md)", marginTop: 6, flexWrap: "wrap" }}>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Assigned: {p.assigned}</span>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Completed: {p.completed}</span>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Pending: {p.pending}</span>
                    <span className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Cancelled: {p.cancelled}</span>
                  </div>
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

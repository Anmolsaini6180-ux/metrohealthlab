import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getAuditLogs } from "@/services/adminAuditService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";

const TARGET_TYPES = ["booking", "test", "package", "lab", "labPricing", "offer", "banner", "coupon", "slot", "serviceArea", "campaign", "lead", "report", "article", "settings", "user", "notification", "payment", "financialTransaction"];

export default function AdminAuditLogsPage() {
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisWeek"));
  const [targetType, setTargetType] = useState("");
  const [actorId, setActorId] = useState("");

  const result = useAsync(
    () => getAuditLogs({ ...range, filterTargetType: targetType || undefined, filterActorId: actorId || undefined }),
    [range.startDate, range.endDate, targetType, actorId]
  );

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Audit logs</h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        Every trust-sensitive change (pricing, catalog, bookings, team, settings) writes here automatically. Never shows passwords, tokens, or API secrets.
      </p>

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-md)" }}>
        <DateRangePicker onChange={(r) => setRange(r)} />
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">All entity types</option>
          {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Filter by actor UID..." value={actorId} onChange={(e) => setActorId(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }} />
      </div>

      {result.loading && <LoadingState rows={4} />}
      {result.error && <ErrorState message={result.error} onRetry={result.retry} />}
      {result.data && result.data.logs.length === 0 && <EmptyState icon="history" title="No audit log entries in this range" />}
      {result.data && result.data.logs.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {result.data.logs.map((log) => (
            <div key={log.id} className="card" style={{ padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{log.action}</span>
                <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{log.actorType}{log.actorId ? ` • ${log.actorId}` : ""}</span>
              </div>
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{log.targetType}: {log.targetId}</p>
            </div>
          ))}
          {result.data.truncated && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Showing the first 300 entries — narrow the date range or filters for more precision.</p>
          )}
        </div>
      )}
    </div>
  );
}

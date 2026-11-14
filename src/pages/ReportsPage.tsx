import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getUserReports, getSecureDownloadUrl } from "@/services/reportService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function ReportsPage() {
  // reports.user_id is a Supabase uuid FK to profiles.id — never the
  // Firebase user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const reports = useAsync(() => (supabaseUserId ? getUserReports(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(reportId: string) {
    setDownloadingId(reportId);
    setDownloadError(null);
    try {
      const { url } = await getSecureDownloadUrl(reportId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setDownloadError(toUserMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="mh2-reports">
      <h1 className="mh2-dashboard__section-title" style={{ fontSize: "var(--text-2xl)" }}>Reports</h1>
      {reports.loading && <LoadingState rows={3} />}
      {reports.error && <ErrorState message={reports.error} onRetry={reports.retry} />}
      {reports.data && reports.data.length === 0 && (
        <EmptyState icon="description" title="No reports yet" description="Reports appear here once a lab uploads them." />
      )}
      {downloadError && <ErrorState message={downloadError} />}
      {reports.data && reports.data.length > 0 && (
        <div className="mh2-list">
          {reports.data.map((r) => {
            // uploadedAt/createdAt come straight off a Postgres
            // timestamptz column via Supabase, so this is always a real
            // ISO string once a value exists — never a guess or a
            // formatted placeholder.
            const rawDate = r.uploadedAt ?? r.createdAt;
            const dateLabel = rawDate ? new Date(String(rawDate)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
            return (
              <div key={r.id} className="mh2-list-card">
                <span className="mh2-list-card__icon" aria-hidden="true">
                  <span className="mi">description</span>
                </span>
                <span className="mh2-list-card__body">
                  {/* bookingId is the internal uuid FK, never shown to a
                      customer (same rule as Booking.id elsewhere) — a
                      report with no filename yet just reads "Report". */}
                  <span className="mh2-list-card__title">{r.filename ?? "Report"}</span>
                  <span className="mh2-list-card__meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`mh2-status-badge ${r.status === "ready" ? "is-completed" : "is-active"}`}>
                      {r.status === "ready" ? "Ready" : "Processing"}
                    </span>
                    {dateLabel && <span>{dateLabel}</span>}
                  </span>
                </span>
                {r.status === "ready" && (
                  <button className="mh2-btn mh2-btn--outline mh2-btn--sm" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id}>
                    <span className="mi" aria-hidden="true">download</span>
                    {downloadingId === r.id ? "Opening..." : "Download"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

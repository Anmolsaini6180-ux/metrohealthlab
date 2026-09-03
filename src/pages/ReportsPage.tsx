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
    <div className="mh-reports">
      <h1 style={{ fontSize: "var(--text-2xl)" }}>Reports</h1>
      {reports.loading && <LoadingState rows={3} />}
      {reports.error && <ErrorState message={reports.error} onRetry={reports.retry} />}
      {reports.data && reports.data.length === 0 && (
        <EmptyState icon="description" title="No reports yet" description="Reports appear here once a lab uploads them." />
      )}
      {downloadError && <ErrorState message={downloadError} />}
      {reports.data && reports.data.length > 0 && (
        <div className="mh-reports__list">
          {reports.data.map((r) => {
            // uploadedAt/createdAt come straight off a Postgres
            // timestamptz column via Supabase, so this is always a real
            // ISO string once a value exists — never a guess or a
            // formatted placeholder.
            const rawDate = r.uploadedAt ?? r.createdAt;
            const dateLabel = rawDate ? new Date(String(rawDate)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
            return (
              <div key={r.id} className="mh-report-card">
                <span className="mh-report-card__icon" aria-hidden="true">
                  <span className="mi">description</span>
                </span>
                <span className="mh-report-card__body">
                  <span className="mh-report-card__title">{r.filename ?? `Booking ${r.bookingId}`}</span>
                  <span className="mh-report-card__meta">
                    <span className={`mh-status-badge ${r.status === "ready" ? "is-completed" : "is-active"}`}>
                      {r.status === "ready" ? "Ready" : "Processing"}
                    </span>
                    {dateLabel && <span className="mh-report-card__date">{dateLabel}</span>}
                  </span>
                </span>
                {r.status === "ready" && (
                  <button className="btn btn-outline" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id}>
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

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
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Reports</h1>
      {reports.loading && <LoadingState rows={3} />}
      {reports.error && <ErrorState message={reports.error} onRetry={reports.retry} />}
      {reports.data && reports.data.length === 0 && (
        <EmptyState icon="description" title="No reports yet" description="Reports appear here once a lab uploads them." />
      )}
      {downloadError && <ErrorState message={downloadError} />}
      {reports.data && reports.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {reports.data.map((r) => (
            <div key={r.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontWeight: 600 }}>Booking {r.bookingId}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {r.status === "ready" ? "Ready" : "Processing"}
                </p>
              </div>
              {r.status === "ready" && (
                <button className="btn btn-outline" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id}>
                  {downloadingId === r.id ? "Opening..." : "Download"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getAllReports } from "@/services/adminOpsService";
import { setReportReady, uploadReportFile } from "@/services/mediaService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import type { Report } from "@/types/report";

export default function AdminReportsPage() {
  const [bookingFilter, setBookingFilter] = useState("");
  const reports = useAsync(() => getAllReports(bookingFilter || undefined), [bookingFilter]);
  const [showCreate, setShowCreate] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleMarkReady(reportId: string) {
    setBusyId(reportId);
    setRowError(null);
    try {
      await setReportReady(reportId);
      reports.retry();
    } catch (err) {
      setRowError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Reports</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Cancel" : "+ Upload report"}
        </button>
      </div>

      {showCreate && (
        <UploadReportForm
          onDone={() => {
            setShowCreate(false);
            reports.retry();
          }}
        />
      )}

      <input
        placeholder="Filter by booking ID..."
        value={bookingFilter}
        onChange={(e) => setBookingFilter(e.target.value)}
        style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)", marginBottom: "var(--space-md)", width: "100%", maxWidth: 300 }}
      />

      {rowError && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{rowError}</p>}
      {reports.loading && <LoadingState rows={3} />}
      {reports.error && <ErrorState message={reports.error} onRetry={reports.retry} />}
      {reports.data && reports.data.length === 0 && <EmptyState icon="description" title="No reports found" />}
      {reports.data && reports.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {reports.data.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              busy={busyId === r.id}
              onMarkReady={() => handleMarkReady(r.id)}
              onReplaced={() => reports.retry()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({
  report,
  busy,
  onMarkReady,
  onReplaced,
}: {
  report: Report;
  busy: boolean;
  onMarkReady: () => void;
  onReplaced: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReplacing(true);
    setError(null);
    try {
      await uploadReportFile({ file, bookingId: report.bookingId, reportId: report.id });
      onReplaced();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setReplacing(false);
    }
  }

  const hasFile = !!report.publicId || !!report.filePath;

  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <div>
        <p style={{ fontWeight: 600 }}>Booking {report.bookingId}</p>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
          {report.status}
          {report.filename ? ` • ${report.filename}` : ""}
          {hasFile ? "" : " • no file attached"}
        </p>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input ref={inputRef} type="file" accept=".pdf,application/pdf,image/*" onChange={handleReplace} style={{ display: "none" }} />
        <button className="btn btn-outline" disabled={replacing} onClick={() => inputRef.current?.click()}>
          {replacing ? "Uploading…" : hasFile ? "Replace file" : "Attach file"}
        </button>
        {report.status !== "ready" && (
          <button className="btn btn-outline" disabled={busy || !hasFile} onClick={onMarkReady}>
            {busy ? "Saving…" : "Mark ready"}
          </button>
        )}
      </div>
    </div>
  );
}

// The customer this report belongs to is NOT entered here — the backend
// reads it off the booking document. That's deliberate: it makes it
// impossible to file a report against the wrong customer by mistyping
// a user ID.
function UploadReportForm({ onDone }: { onDone: () => void }) {
  const [bookingId, setBookingId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [labId, setLabId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [markReady, setMarkReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a report file to upload.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { reportId } = await uploadReportFile({
        file,
        bookingId: bookingId.trim(),
        patientId: patientId.trim() || undefined,
        labId: labId.trim() || undefined,
      });
      if (markReady) await setReportReady(reportId);
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
        The file uploads straight to secure storage — no Firebase Console step. The customer is taken
        from the booking, and only they (or staff) can ever download it, through a link that expires
        after 10 minutes.
      </p>
      <input placeholder="Booking ID" required value={bookingId} onChange={(e) => setBookingId(e.target.value)} />
      <input placeholder="Patient ID (optional — defaults to the booking's patient)" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
      <input placeholder="Lab ID (optional — defaults to the booking's lab)" value={labId} onChange={(e) => setLabId(e.target.value)} />
      <input type="file" accept=".pdf,application/pdf,image/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)" }}>
        <input type="checkbox" checked={markReady} onChange={(e) => setMarkReady(e.target.checked)} />
        Mark ready and notify the customer immediately
      </label>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Uploading…" : "Upload report"}
      </button>
    </form>
  );
}

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { createLead, getLeads, updateLeadStatus } from "@/services/adminMarketingService";
import type { Lead, LeadStatus } from "@/types/marketing";
import DateRangePicker from "@/components/admin/DateRangePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { toUserMessage } from "@/utils/errors";

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "CONVERTED", "LOST"];

export default function AdminLeadsPage() {
  const { user } = useAuth();
  const { role } = useAdminRole();
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const leads = useAsync(() => getLeads({ ...range, filterStatus: statusFilter || undefined }), [range.startDate, range.endDate, statusFilter]);
  const canCreate = role === "SUPER_ADMIN" || role === "ADMIN";

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    if (!user) return;
    await updateLeadStatus(user.uid, lead.id, status);
    leads.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Leads</h1>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add lead"}</button>
        )}
      </div>

      {showCreate && user && <LeadForm actorUid={user.uid} onDone={() => { setShowCreate(false); leads.retry(); }} />}

      <div style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
        <DateRangePicker onChange={(r) => setRange(r)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 200, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {leads.loading && <LoadingState rows={3} />}
      {leads.error && <ErrorState message={leads.error} onRetry={leads.retry} />}
      {leads.data && leads.data.length === 0 && <EmptyState icon="person_add" title="No leads in this range" />}
      {leads.data && leads.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {leads.data.map((l) => (
            <div key={l.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{l.name}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{l.phone}{l.email ? ` • ${l.email}` : ""} {l.source ? `• ${l.source}` : ""}</p>
              </div>
              <select value={l.status} onChange={(e) => handleStatusChange(l, e.target.value as LeadStatus)} style={{ padding: 6, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadForm({ actorUid, onDone }: { actorUid: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createLead(actorUid, { name, phone, email, source, status: "NEW" });
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Source (e.g. website, referral)" value={source} onChange={(e) => setSource(e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Add lead"}</button>
    </form>
  );
}

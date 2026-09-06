import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import {
  createLead,
  getAllCampaigns,
  getLeads,
  searchBookingsForLeadLink,
  sendBulkNotificationToLeads,
  updateLead,
  updateLeadStatus,
  type BookingSearchResult,
} from "@/services/adminMarketingService";
import { useToast } from "@/hooks/useToast";
import { formatCurrencyInr } from "@/services/pricingService";
import { downloadCsv } from "@/utils/csvExport";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type Lead, type LeadStatus } from "@/types/marketing";
import DateRangePicker from "@/components/admin/DateRangePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { toUserMessage } from "@/utils/errors";

export default function AdminLeadsPage() {
  const { user } = useAuth();
  const { role } = useAdminRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const campaignId = searchParams.get("campaignId") ?? "";
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkNotify, setShowBulkNotify] = useState(false);

  const leads = useAsync(() => getLeads({ ...range, filterStatus: statusFilter || undefined }), [range.startDate, range.endDate, statusFilter]);
  const campaigns = useAsync(getAllCampaigns, []);
  const campaignNameById = useMemo(() => new Map((campaigns.data ?? []).map((c) => [c.id, c.name])), [campaigns.data]);
  const canCreate = role === "SUPER_ADMIN" || role === "ADMIN";

  const visible = useMemo(() => {
    let rows = leads.data ?? [];
    if (campaignId) rows = rows.filter((l) => l.campaignId === campaignId);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((l) => l.name.toLowerCase().includes(q) || l.phone.includes(q));
    return rows;
  }, [leads.data, campaignId, search]);

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    if (!user) return;
    await updateLeadStatus(user.uid, lead.id, status);
    leads.retry();
  }

  function exportCsv() {
    downloadCsv("leads", visible, [
      { header: "Name", value: (l: Lead) => l.name },
      { header: "Phone", value: (l: Lead) => l.phone },
      { header: "Email", value: (l: Lead) => l.email ?? "" },
      { header: "Source", value: (l: Lead) => l.source ?? "" },
      { header: "Campaign", value: (l: Lead) => (l.campaignId ? campaignNameById.get(l.campaignId) ?? l.campaignId : "") },
      { header: "Status", value: (l: Lead) => LEAD_STATUS_LABELS[l.status] },
      { header: "Booking", value: (l: Lead) => l.bookingId ?? "" },
      { header: "Created", value: (l: Lead) => String(l.createdAt ?? "") },
    ]);
  }

  return (
    <div>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Leads</h1>
          {campaignId && (
            <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
              Filtered to campaign: {campaignNameById.get(campaignId) ?? campaignId}{" "}
              <button
                type="button"
                onClick={() => setSearchParams({})}
                style={{ fontSize: "var(--text-xs)", background: "none", border: "none", padding: 0, color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer" }}
              >
                Clear
              </button>
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={exportCsv} disabled={visible.length === 0}>
            <span className="mi" aria-hidden="true">download</span> Export CSV
          </button>
          {canCreate && selectedIds.size > 0 && (
            <button className="btn btn-outline" onClick={() => setShowBulkNotify((s) => !s)}>
              <span className="mi" aria-hidden="true">campaign</span> {showBulkNotify ? "Cancel" : `Notify (${selectedIds.size})`}
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add lead"}</button>
          )}
        </div>
      </div>

      {showCreate && user && <LeadForm actorUid={user.uid} campaigns={campaigns.data ?? []} onDone={() => { setShowCreate(false); leads.retry(); }} />}
      {showBulkNotify && (
        <BulkNotifyForm
          leadIds={[...selectedIds]}
          onDone={() => {
            setShowBulkNotify(false);
            setSelectedIds(new Set());
          }}
          onCancel={() => setShowBulkNotify(false)}
        />
      )}

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-md)", alignItems: "center" }}>
        <DateRangePicker onChange={(r) => setRange(r)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
        </select>
        <input type="search" placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }} />
      </div>

      {leads.loading && <LoadingState rows={3} />}
      {leads.error && <ErrorState message={leads.error} onRetry={leads.retry} />}
      {leads.data && visible.length === 0 && <EmptyState icon="person_add" title="No leads match" />}
      {leads.data && visible.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {canCreate && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)" }}>
              <input
                type="checkbox"
                checked={visible.length > 0 && visible.every((l) => selectedIds.has(l.id))}
                onChange={(e) => setSelectedIds(e.target.checked ? new Set(visible.map((l) => l.id)) : new Set())}
              />
              Select all {visible.length} shown
            </label>
          )}
          {visible.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              campaignName={l.campaignId ? campaignNameById.get(l.campaignId) : undefined}
              onStatusChange={(s) => handleStatusChange(l, s)}
              onLinked={leads.retry}
              actorUid={user?.uid ?? ""}
              selectable={canCreate}
              selected={selectedIds.has(l.id)}
              onToggleSelect={() =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(l.id)) next.delete(l.id);
                  else next.add(l.id);
                  return next;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadRow({
  lead,
  campaignName,
  onStatusChange,
  onLinked,
  actorUid,
  selectable,
  selected,
  onToggleSelect,
}: {
  lead: Lead;
  campaignName?: string;
  onStatusChange: (status: LeadStatus) => void;
  onLinked: () => void;
  actorUid: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [linking, setLinking] = useState(false);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
          {selectable && (
            <input type="checkbox" checked={!!selected} onChange={onToggleSelect} style={{ marginTop: 4 }} aria-label={`Select ${lead.name}`} />
          )}
          <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600 }}>{lead.name}</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            {lead.phone}{lead.email ? ` • ${lead.email}` : ""}{lead.source ? ` • ${lead.source}` : ""}
          </p>
          {campaignName && <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Campaign: {campaignName}</p>}
          </div>
        </div>
        <select value={lead.status} onChange={(e) => onStatusChange(e.target.value as LeadStatus)} style={{ padding: 6, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div style={{ marginTop: 8 }}>
        {lead.bookingId ? (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-success)" }}>
            <span className="mi" aria-hidden="true" style={{ fontSize: 14, verticalAlign: "middle" }}>link</span> Linked to booking {lead.bookingId}
          </p>
        ) : linking ? (
          <BookingLinkPicker leadId={lead.id} actorUid={actorUid} onDone={() => { setLinking(false); onLinked(); }} onCancel={() => setLinking(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setLinking(true)}
            style={{ fontSize: "var(--text-xs)", background: "none", border: "none", padding: 0, color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer" }}
          >
            Link to booking
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The real, admin-confirmed Campaign -> Lead -> Booking attribution
 * step — nothing here is inferred. Every campaign ROI/revenue figure
 * only ever counts a lead once someone deliberately links it here.
 */
function BookingLinkPicker({ leadId, actorUid, onDone, onCancel }: { leadId: string; actorUid: string; onDone: () => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookingSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    setError(null);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchBookingsForLeadLink(value));
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function handleLink(bookingId: string) {
    setSaving(bookingId);
    setError(null);
    try {
      await updateLead(actorUid, leadId, { bookingId, status: "CONVERTED" });
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
      setSaving(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, padding: 8, background: "var(--color-bg-tint)", borderRadius: "var(--radius-sm)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input autoFocus placeholder="Search by customer name or phone..." value={query} onChange={(e) => handleSearch(e.target.value)} style={{ flex: 1 }} />
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
      {searching && <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Searching...</p>}
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      {!searching && query.trim().length >= 3 && results.length === 0 && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>No matching bookings found.</p>
      )}
      {results.map((r) => (
        <button
          key={r.id}
          type="button"
          className="mh-add-row"
          disabled={saving !== null}
          onClick={() => handleLink(r.id)}
          style={{ justifyContent: "space-between", textAlign: "left" }}
        >
          <span>{r.customerLabel} — {r.date}</span>
          <span>{saving === r.id ? "Linking..." : formatCurrencyInr(r.finalAmount)}</span>
        </button>
      ))}
    </div>
  );
}

function LeadForm({ actorUid, campaigns, onDone }: { actorUid: string; campaigns: { id: string; name: string }[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createLead(actorUid, { name, phone, email, source, campaignId, status: "NEW" });
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
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <input placeholder="Source (e.g. website, referral)" value={source} onChange={(e) => setSource(e.target.value)} style={{ flex: 1 }} />
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ flex: 1 }}>
          <option value="">No campaign</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Add lead"}</button>
    </form>
  );
}

/**
 * Sends an in-app notification to whichever selected leads have a
 * phone matching a real registered customer account (see
 * sendBulkNotificationToLeads' own comment) — a lead with no matching
 * account is honestly reported as unmatched afterward, never silently
 * dropped or claimed as "sent".
 */
function BulkNotifyForm({ leadIds, onDone, onCancel }: { leadIds: string[]; onDone: () => void; onCancel: () => void }) {
  const { showToast } = useToast();
  const [type, setType] = useState<"offer" | "system">("offer");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; unmatched: number } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await sendBulkNotificationToLeads(leadIds, { type, title, message });
      setResult({ matched: res.matched, unmatched: res.unmatched });
      if (res.matched > 0) {
        showToast(`Sent to ${res.matched} of ${res.totalLeads} leads.`);
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSend} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <p style={{ fontWeight: 700 }}>Send bulk notification to {leadIds.length} selected lead{leadIds.length === 1 ? "" : "s"}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={type === "offer" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setType("offer")}>Offer</button>
        <button type="button" className={type === "system" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setType("system")}>System</button>
      </div>
      <input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Message" required rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />

      {result && (
        <div className="card" style={{ background: "var(--color-bg-tint)" }}>
          <p style={{ fontSize: "var(--text-sm)" }}>
            Delivered to <strong>{result.matched}</strong> lead{result.matched === 1 ? "" : "s"} with a registered account.
          </p>
          {result.unmatched > 0 && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              {result.unmatched} of the selected leads have no matching registered account yet (this app signs customers in by
              phone — a lead only receives an in-app notification once that same phone number has actually created an account),
              so nothing could be delivered to them here.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" type="submit" disabled={busy || !!result}>{busy ? "Sending..." : "Send"}</button>
        <button type="button" className="btn btn-outline" onClick={result ? onDone : onCancel}>
          {result ? "Done" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

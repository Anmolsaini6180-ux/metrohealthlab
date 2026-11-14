import { useMemo, useState } from "react";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToAllTickets, updateTicketStatus, type AdminSupportTicket } from "@/services/adminSupportService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/admin/StatusBadge";
import { toUserMessage } from "@/utils/errors";
import type { SupportTicket } from "@/types/support";

const STATUSES: SupportTicket["status"][] = ["open", "in_progress", "resolved", "closed"];

// Live: a new ticket, or a status change from any admin, shows up here
// without a refresh. There is no "reply" box below — support_tickets
// has no thread/response column in this schema, and this screen only
// ever exposes what actually persists (list, filter, status), never a
// text box that would look like it sent something when nothing is
// stored anywhere.
export default function AdminSupportPage() {
  const tickets = useRealtimeQuery<AdminSupportTicket[]>(subscribeToAllTickets, []);
  const [statusFilter, setStatusFilter] = useState<SupportTicket["status"] | "">("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const rows = tickets.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q) ||
        (t.customerName ?? "").toLowerCase().includes(q) ||
        (t.customerPhone ?? "").includes(q)
      );
    });
  }, [tickets.data, statusFilter, search]);

  async function handleStatusChange(ticket: AdminSupportTicket, status: SupportTicket["status"]) {
    setBusyId(ticket.id);
    setError(null);
    try {
      await updateTicketStatus(ticket.id, status);
      // The realtime subscription delivers the change on its own; no
      // manual retry needed.
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Support</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Customer support tickets, updates live.</p>
        </div>
      </div>

      <div className="mh-filter-row">
        <input
          type="search"
          placeholder="Search subject, message, customer, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 240, flex: 1 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SupportTicket["status"] | "")}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      {tickets.loading && <LoadingState rows={4} label="Loading tickets..." />}
      {tickets.error && <ErrorState message={tickets.error} onRetry={tickets.retry} />}
      {tickets.data && tickets.data.length === 0 && <EmptyState icon="support_agent" title="No support tickets yet" />}
      {tickets.data && tickets.data.length > 0 && visible.length === 0 && (
        <EmptyState icon="search_off" title="No tickets match these filters" />
      )}

      {visible.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {visible.map((t) => (
            <div key={t.id} className="card" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700 }}>{t.subject}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {t.customerName ?? "Unknown customer"}
                    {t.customerPhone ? ` • ${t.customerPhone}` : ""}
                    {t.customerEmail ? ` • ${t.customerEmail}` : ""}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>{t.message}</p>

              {t.bookingId && (
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Booking: {t.bookingId}</p>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                  Status:{" "}
                  <select
                    value={t.status}
                    disabled={busyId === t.id}
                    onChange={(e) => handleStatusChange(t, e.target.value as SupportTicket["status"])}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </label>
                {busyId === t.id && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Saving…</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

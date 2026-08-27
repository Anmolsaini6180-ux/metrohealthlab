import { useState } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { assignBooking, getAdminBookings, updateBookingStatus } from "@/services/adminBookingService";
import { getTeamMembers } from "@/services/adminTeamService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { BookingStatus } from "@/types/booking";
import DateRangePicker from "@/components/admin/DateRangePicker";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import StatusBadge from "@/components/admin/StatusBadge";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

const STATUS_LABELS: Record<string, string> = {
  payment_pending: "Awaiting payment",
  confirmed: "Confirmed",
  assigned: "Assigned",
  on_the_way: "On the way",
  arrived: "Arrived",
  sample_collected: "Sample collected",
  received_at_lab: "Received at lab",
  testing: "Testing",
  report_ready: "Report ready",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const FORWARD_SEQUENCE: BookingStatus[] = [
  "assigned", "on_the_way", "arrived", "sample_collected", "received_at_lab", "testing", "report_ready", "completed",
];

function nextStatus(current: BookingStatus): BookingStatus | null {
  const idx = FORWARD_SEQUENCE.indexOf(current);
  if (idx === -1 || idx === FORWARD_SEQUENCE.length - 1) return null;
  return FORWARD_SEQUENCE[idx + 1];
}

const PRIVILEGED = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];

export default function AdminBookingsPage() {
  const { role } = useAdminRole();
  const { showToast } = useToast();
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("today"));
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

  const bookings = useAsync(
    () => getAdminBookings({ ...range, filterBookingStatus: statusFilter || undefined }),
    [range.startDate, range.endDate, statusFilter]
  );
  const agents = useAsync(
    () => (role && PRIVILEGED.includes(role) ? getTeamMembers("COLLECTION_AGENT") : Promise.resolve([])),
    [role]
  );

  async function handleAssign(bookingId: string, agentUid: string) {
    if (!agentUid) return;
    setBusyId(bookingId);
    setActionError(null);
    try {
      await assignBooking(bookingId, agentUid);
      showToast("Collector assigned.");
      bookings.retry();
    } catch (err) {
      setActionError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvance(bookingId: string, status: BookingStatus) {
    setBusyId(bookingId);
    setActionError(null);
    try {
      await updateBookingStatus(bookingId, status);
      showToast(`Marked ${STATUS_LABELS[status]}.`);
      bookings.retry();
    } catch (err) {
      setActionError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmCancel() {
    if (!pendingCancelId) return;
    setBusyId(pendingCancelId);
    setActionError(null);
    try {
      await updateBookingStatus(pendingCancelId, "cancelled");
      showToast("Booking cancelled.");
      setPendingCancelId(null);
      bookings.retry();
    } catch (err) {
      setActionError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const isPrivileged = !!role && PRIVILEGED.includes(role);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Bookings</h1>

      <div style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
        <DateRangePicker onChange={(r) => setRange(r)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 220, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {actionError && <ErrorState message={actionError} />}
      {bookings.loading && <LoadingState label="Loading bookings..." rows={4} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}
      {bookings.data && bookings.data.bookings.length === 0 && <EmptyState icon="calendar_month" title="No bookings in this range" />}

      {bookings.data && bookings.data.bookings.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {bookings.data.bookings.map((b) => {
            const next = nextStatus(b.bookingStatus);
            const canAdvance = isPrivileged || (role === "COLLECTION_AGENT" && b.assignedAgentId);
            return (
              <div key={b.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{b.id}</p>
                    <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{b.items.map((i) => i.name).join(", ")}</p>
                    <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.date} • {b.collectionType}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 600 }}>{formatCurrencyInr(b.finalAmount)}</p>
                    <div style={{ margin: "4px 0" }}><StatusBadge status={b.bookingStatus} /></div>
                    <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.paymentStatus.replace(/_/g, " ")}</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
                  {b.bookingStatus === "confirmed" && isPrivileged && (
                    <select
                      defaultValue=""
                      disabled={busyId === b.id}
                      onChange={(e) => handleAssign(b.id, e.target.value)}
                      style={{ padding: 6, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
                    >
                      <option value="" disabled>Assign agent...</option>
                      {(agents.data ?? []).map((a) => (
                        <option key={a.uid} value={a.uid}>{a.name}</option>
                      ))}
                    </select>
                  )}
                  {next && canAdvance && (
                    <button className="btn btn-outline" disabled={busyId === b.id} onClick={() => handleAdvance(b.id, next)}>
                      Mark {STATUS_LABELS[next]}
                    </button>
                  )}
                  {isPrivileged && !["completed", "cancelled", "refunded"].includes(b.bookingStatus) && (
                    <button className="btn btn-danger" disabled={busyId === b.id} onClick={() => setPendingCancelId(b.id)}>
                      Cancel booking
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {bookings.data.truncated && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              Showing the first 500 results — narrow the date range or status filter to see more precisely.
            </p>
          )}
        </div>
      )}
      {pendingCancelId && (
        <ConfirmDialog
          title="Cancel this booking?"
          message={`Booking ${pendingCancelId} will be marked cancelled. This can't be undone from here.`}
          confirmLabel="Cancel booking"
          busy={busyId === pendingCancelId}
          onConfirm={handleConfirmCancel}
          onCancel={() => setPendingCancelId(null)}
        />
      )}
    </div>
  );
}

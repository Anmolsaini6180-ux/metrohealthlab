import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getAdminBookings } from "@/services/adminBookingService";
import { updateBookingStatus } from "@/services/adminBookingService";
import type { Booking, BookingStatus } from "@/types/booking";
import { formatCurrencyInr } from "@/services/pricingService";
import DateRangePicker from "@/components/admin/DateRangePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { toUserMessage } from "@/utils/errors";

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

// Only these three are genuinely the collection agent's own actions
// (start traveling, arrived, collected the sample). What happens after
// sample_collected — received at lab, testing, report ready, completed
// — is the lab's pipeline, not something a field agent marks; the
// existing forward-only sequence in updateBookingStatus is preserved
// as-is rather than inventing a shortcut "Complete" button that would
// skip real stages.
const AGENT_ACTION_LABELS: Partial<Record<BookingStatus, { next: BookingStatus; label: string }>> = {
  assigned: { next: "on_the_way", label: "Start" },
  on_the_way: { next: "arrived", label: "Arrived" },
  arrived: { next: "sample_collected", label: "Sample Collected" },
};

const TABS = ["Today", "Upcoming", "Pending", "Completed", "Cancelled"] as const;
type Tab = (typeof TABS)[number];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function matchesTab(b: Booking, tab: Tab): boolean {
  switch (tab) {
    case "Today":
      return b.date === todayIso();
    case "Upcoming":
      return b.date > todayIso() && !["completed", "cancelled", "refunded"].includes(b.bookingStatus);
    case "Pending":
      return ["assigned", "on_the_way", "arrived", "sample_collected", "received_at_lab", "testing", "report_ready"].includes(b.bookingStatus);
    case "Completed":
      return b.bookingStatus === "completed";
    case "Cancelled":
      return b.bookingStatus === "cancelled" || b.bookingStatus === "refunded";
  }
}

export default function AgentDashboardPage() {
  const { user } = useAuth();
  const [range] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [tab, setTab] = useState<Tab>("Today");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeRange = customRange ?? range;
  const bookings = useAsync(
    () => getAdminBookings(activeRange).then((r) => r.bookings),
    [activeRange.startDate, activeRange.endDate]
  );

  const filtered = (bookings.data ?? []).filter((b) => matchesTab(b, tab));

  async function handleAdvance(bookingId: string, next: BookingStatus) {
    setBusyId(bookingId);
    setActionError(null);
    try {
      await updateBookingStatus(bookingId, next);
      bookings.retry();
    } catch (err) {
      setActionError(toUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-xl)" }}>My collections</h1>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{user?.email}</p>
      </div>

      <DateRangePicker onChange={(r) => setCustomRange(r)} />

      <div className="mh-chip-row" style={{ display: "flex", gap: "var(--space-sm)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "btn btn-primary" : "btn btn-outline"} onClick={() => setTab(t)} style={{ whiteSpace: "nowrap" }}>
            {t}
          </button>
        ))}
      </div>

      {actionError && <ErrorState message={actionError} />}
      {bookings.loading && <LoadingState label="Loading your assignments..." rows={3} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}
      {bookings.data && filtered.length === 0 && (
        <EmptyState icon="local_shipping" title={`No ${tab.toLowerCase()} collections`} />
      )}

      {filtered.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {filtered.map((b) => {
            const action = AGENT_ACTION_LABELS[b.bookingStatus];
            return (
              <div key={b.id} className="card">
                <p style={{ fontWeight: 600 }}>{b.id}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{b.items.map((i) => i.name).join(", ")}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {b.date} • {b.collectionType === "home" ? "Home collection" : "Center visit"}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{formatCurrencyInr(b.finalAmount)}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-sm)" }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{STATUS_LABELS[b.bookingStatus]}</span>
                  {action && (
                    <button className="btn btn-accent" disabled={busyId === b.id} onClick={() => handleAdvance(b.id, action.next)}>
                      {busyId === b.id ? "Updating..." : action.label}
                    </button>
                  )}
                  {!action && b.bookingStatus === "sample_collected" && (
                    <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Awaiting lab processing</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

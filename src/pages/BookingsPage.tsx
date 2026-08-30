import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToUserBookings } from "@/services/bookingService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { Booking, BookingStatus } from "@/types/booking";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

const STATUS_LABELS: Record<string, string> = {
  payment_pending: "Awaiting payment",
  confirmed: "Confirmed",
  assigned: "Collector assigned",
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

const TABS = ["Upcoming", "Active", "Completed", "Cancelled"] as const;
type Tab = (typeof TABS)[number];

const ACTIVE_STATUSES: BookingStatus[] = ["assigned", "on_the_way", "arrived", "sample_collected", "received_at_lab", "testing"];

function matchesTab(b: Booking, tab: Tab): boolean {
  switch (tab) {
    case "Upcoming":
      return b.bookingStatus === "payment_pending" || b.bookingStatus === "confirmed";
    case "Active":
      return ACTIVE_STATUSES.includes(b.bookingStatus);
    case "Completed":
      return b.bookingStatus === "completed" || b.bookingStatus === "report_ready";
    case "Cancelled":
      return b.bookingStatus === "cancelled" || b.bookingStatus === "refunded";
  }
}

export default function BookingsPage() {
  // bookings.user_id is a Supabase uuid FK to profiles.id — must use
  // supabaseUserId here, never the Firebase user.uid (see
  // src/supabase/identity.ts), or every query 22P02s.
  const { supabaseUserId } = useAuth();
  // Live, so a status change or a cash collection made by staff shows
  // up on the customer's own list without a refresh.
  const bookings = useRealtimeQuery<Booking[]>(
    (onData, onError) =>
      supabaseUserId ? subscribeToUserBookings(supabaseUserId, onData, onError) : (onData([]), () => {}),
    [supabaseUserId]
  );
  const [tab, setTab] = useState<Tab>("Upcoming");

  const filtered = useMemo(() => (bookings.data ?? []).filter((b) => matchesTab(b, tab)), [bookings.data, tab]);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Your bookings</h1>

      <div className="mh-chip-row" style={{ display: "flex", gap: "var(--space-sm)", overflowX: "auto", marginBottom: "var(--space-md)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? "btn btn-primary" : "btn btn-outline"}
            onClick={() => setTab(t)}
            style={{ whiteSpace: "nowrap" }}
          >
            {t}
          </button>
        ))}
      </div>

      {bookings.loading && <LoadingState rows={3} />}
      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}
      {bookings.data && filtered.length === 0 && (
        <EmptyState icon="calendar_month" title={`No ${tab.toLowerCase()} bookings`} description="Book a test or package to see it here." />
      )}
      {bookings.data && filtered.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {filtered.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{b.id}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  {b.items.map((i) => i.name).join(", ")}
                </p>
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.date}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontWeight: 600 }}>{formatCurrencyInr(b.finalAmount)}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{STATUS_LABELS[b.bookingStatus] ?? b.bookingStatus}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

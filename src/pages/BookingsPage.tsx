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

// Same four buckets as matchesTab, but keyed by a single booking so the
// card badge always agrees with whichever tab the booking would appear
// under - one source of truth for the grouping, two different views.
function statusTone(status: BookingStatus): Tab {
  if (status === "payment_pending" || status === "confirmed") return "Upcoming";
  if (ACTIVE_STATUSES.includes(status)) return "Active";
  if (status === "completed" || status === "report_ready") return "Completed";
  return "Cancelled";
}

const TONE_CLASS: Record<Tab, string> = {
  Upcoming: "is-upcoming",
  Active: "is-active",
  Completed: "is-completed",
  Cancelled: "is-cancelled",
};

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
    <div className="mh-bookings">
      <h1 style={{ fontSize: "var(--text-2xl)" }}>My Bookings</h1>

      <div className="mh-tab-row">
        {TABS.map((t) => (
          <button key={t} className={`mh-tab-btn${tab === t ? " is-active" : ""}`} onClick={() => setTab(t)}>
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
        <div className="mh-bookings__list">
          {filtered.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="mh-booking-card">
              <span className="mh-booking-card__icon" aria-hidden="true">
                <span className="mi">science</span>
              </span>
              <span className="mh-booking-card__body">
                <span className="mh-booking-card__row">
                  <span className="mh-booking-card__id">{b.reference}</span>
                  <span className={`mh-status-badge ${TONE_CLASS[statusTone(b.bookingStatus)]}`}>
                    {STATUS_LABELS[b.bookingStatus] ?? b.bookingStatus}
                  </span>
                </span>
                <span className="mh-booking-card__items">{b.items.map((i) => i.name).join(", ")}</span>
                <span className="mh-booking-card__row">
                  <span className="mh-booking-card__date">
                    <span className="mi" aria-hidden="true">event</span>
                    {new Date(b.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="mh-booking-card__price">{formatCurrencyInr(b.finalAmount)}</span>
                </span>
              </span>
              <span className="mh-booking-card__chevron mi" aria-hidden="true">chevron_right</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

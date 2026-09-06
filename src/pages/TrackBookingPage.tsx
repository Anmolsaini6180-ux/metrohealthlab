import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { subscribeToBooking, subscribeToBookingStatusHistory } from "@/services/bookingService";
import type { Booking, BookingStatus, BookingStatusHistoryEntry } from "@/types/booking";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { formatCurrencyInr } from "@/services/pricingService";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import Countdown from "@/components/common/Countdown";

const TIMELINE: BookingStatus[] = [
  "confirmed",
  "assigned",
  "on_the_way",
  "arrived",
  "sample_collected",
  "received_at_lab",
  "testing",
  "report_ready",
  "completed",
];

const STEP_LABELS: Record<BookingStatus, string> = {
  payment_pending: "Awaiting payment",
  confirmed: "Booking confirmed",
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

// Realtime: no manual refresh needed. When the admin panel updates
// bookingStatus, this listener pushes the change here immediately.
export default function TrackBookingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const location = useLocation();
  const { settings } = useBrandingSettings();
  // Never hardcoded — absent entirely (no "Call us" link) rather than
  // fabricating a number if admin/settings hasn't set one yet.
  const contactPhone = settings?.phone?.trim() || null;
  // Only true for the one navigation BookingFlowPage makes right after
  // creating this booking - set via router state, not derived from
  // status, so revisiting a saved tracking link later never re-shows
  // the "just booked" fanfare for an old booking that happens to still
  // be sitting at "confirmed".
  const justBooked = Boolean((location.state as { justBooked?: boolean } | null)?.justBooked);
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [history, setHistory] = useState<BookingStatusHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bumping this re-runs the effect below, tearing down and
  // re-establishing both subscriptions from scratch — the actual
  // "safe re-fetch" a transient Realtime disconnect needs, since these
  // are live subscriptions (no promise to just retry) rather than a
  // one-shot fetch.
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!bookingId) return;
    setError(null);
    const unsubBooking = subscribeToBooking(bookingId, setBooking, (e) => setError(e.message));
    const unsubHistory = subscribeToBookingStatusHistory(bookingId, setHistory, (e) => setError(e.message));
    return () => {
      unsubBooking();
      unsubHistory();
    };
  }, [bookingId, retryKey]);

  if (error) return <ErrorState message={error} onRetry={() => setRetryKey((k) => k + 1)} />;
  if (booking === undefined) return <LoadingState label="Loading tracking..." />;
  if (booking === null) return <EmptyState icon="search_off" title="Booking not found" />;

  const currentIndex = TIMELINE.indexOf(booking.bookingStatus);

  return (
    <div className="mh-track">
      {justBooked && booking.bookingStatus !== "cancelled" && booking.bookingStatus !== "refunded" && (
        <div className="mh-track__success">
          <span className="mh-track__success-icon" aria-hidden="true">
            <span className="mi">check_circle</span>
          </span>
          <h1 className="mh-track__success-title">Booking Confirmed!</h1>
          <p className="mh-track__success-id">Booking ID: {booking.reference}</p>

          <div className="mh-track__summary">
            {booking.items.map((it, i) => (
              <div className="mh-order-summary__row" key={i}>
                <span>{it.name}</span>
                <span>{formatCurrencyInr(it.price)}</span>
              </div>
            ))}
            <hr className="mh-order-summary__rule" />
            <div className="mh-order-summary__row">
              <span>Date</span>
              <span>{new Date(booking.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
            </div>
            <div className="mh-order-summary__row">
              <span>{booking.collectionType === "home" ? "Address" : "Collection"}</span>
              <span>{booking.collectionType === "home" ? booking.contact?.address ?? "Home collection" : "Center visit"}</span>
            </div>
            <div className="mh-order-summary__row is-total">
              <span>Total Amount</span>
              <span>{formatCurrencyInr(booking.finalAmount)}</span>
            </div>
            <div className="mh-order-summary__row">
              <span>Payment</span>
              <span>Cash on Home</span>
            </div>
          </div>

          <p className="mh-track__whatsnext">
            <span className="mi" aria-hidden="true">info</span>
            What's next: our team will assign a collector and reach out before arrival. Track every
            step live on this page.
          </p>

          <div className="mh-track__actions">
            <Link className="btn btn-outline" to="/bookings">
              View My Bookings
            </Link>
            <Link className="btn btn-primary" to="/">
              Back to Home
            </Link>
          </div>
        </div>
      )}

      <div>
        <h1 style={{ fontSize: "var(--text-xl)" }}>{justBooked ? "Live Status" : `Tracking ${booking.reference}`}</h1>
        <p className="text-soft">{STEP_LABELS[booking.bookingStatus]}</p>
        {booking.bookingStatus !== "cancelled" && booking.bookingStatus !== "refunded" && booking.bookingStatus !== "completed" && (
          <p style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
            <Countdown startAt={booking.startAt} />
          </p>
        )}
      </div>

      {booking.bookingStatus === "payment_pending" ? (
        <div className="card" style={{ display: "grid", gap: "var(--space-sm)" }}>
          <p style={{ fontWeight: 600 }}>
            {booking.paymentStatus === "failed" ? "Payment didn't go through" : "Waiting for payment confirmation..."}
          </p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            {booking.paymentStatus === "failed"
              ? "Your booking is held — retry payment to confirm it."
              : "This updates automatically the moment payment is verified — no need to refresh."}
          </p>
          <Link className="btn btn-accent" to={`/bookings/${booking.id}`}>
            {booking.paymentStatus === "failed" ? "Retry payment" : "View booking"}
          </Link>
        </div>
      ) : booking.bookingStatus === "cancelled" || booking.bookingStatus === "refunded" ? (
        <div className="card">{STEP_LABELS[booking.bookingStatus]}</div>
      ) : (
        <ol className="mh-timeline">
          {TIMELINE.map((status, i) => (
            <li key={status} className={`mh-timeline__item${i <= currentIndex ? " is-done" : ""}`}>
              <span className="mh-timeline__dot" aria-hidden="true">
                <span className="mi">{i <= currentIndex ? "check" : ""}</span>
              </span>
              {i < TIMELINE.length - 1 && <span className="mh-timeline__line" aria-hidden="true" />}
              <span className="mh-timeline__label">{STEP_LABELS[status]}</span>
            </li>
          ))}
        </ol>
      )}

      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Updates</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {history.map((h) => (
              <p key={h.id} className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                {STEP_LABELS[h.status]} {h.note ? `— ${h.note}` : ""}
              </p>
            ))}
          </div>
        </div>
      )}

      {contactPhone && (
        <a className="btn btn-outline" href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`} style={{ justifySelf: "start" }}>
          <span className="mi" aria-hidden="true">call</span> Call us about this booking
        </a>
      )}
    </div>
  );
}

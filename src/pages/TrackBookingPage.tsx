import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { subscribeToBooking, subscribeToBookingStatusHistory } from "@/services/bookingService";
import type { Booking, BookingStatus, BookingStatusHistoryEntry } from "@/types/booking";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

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

// Realtime: no manual refresh needed. When the (future) admin panel
// updates bookingStatus in Firestore, this listener pushes the change
// here immediately via onSnapshot.
export default function TrackBookingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [history, setHistory] = useState<BookingStatusHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    const unsubBooking = subscribeToBooking(bookingId, setBooking, (e) => setError(e.message));
    const unsubHistory = subscribeToBookingStatusHistory(bookingId, setHistory, (e) => setError(e.message));
    return () => {
      unsubBooking();
      unsubHistory();
    };
  }, [bookingId]);

  if (error) return <ErrorState message={error} />;
  if (booking === undefined) return <LoadingState label="Loading tracking..." />;
  if (booking === null) return <EmptyState icon="search_off" title="Booking not found" />;

  const currentIndex = TIMELINE.indexOf(booking.bookingStatus);

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Tracking {booking.id}</h1>
        <p className="text-soft">{STEP_LABELS[booking.bookingStatus]}</p>
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
        <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-sm)" }}>
          {TIMELINE.map((status, i) => (
            <li
              key={status}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-sm)",
                opacity: i <= currentIndex ? 1 : 0.4,
              }}
            >
              <span
                className="mi"
                style={{
                  color: i <= currentIndex ? "var(--color-primary)" : "var(--color-ink-soft)",
                }}
              >
                {i <= currentIndex ? "check_circle" : "radio_button_unchecked"}
              </span>
              {STEP_LABELS[status]}
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
    </div>
  );
}

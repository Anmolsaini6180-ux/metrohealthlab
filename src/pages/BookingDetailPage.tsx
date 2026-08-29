import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { getBookingById } from "@/services/bookingService";
import { formatCurrencyInr } from "@/services/pricingService";
import { pendingFor } from "@/utils/bookingMetrics";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useAsync(() => getBookingById(id!), [id]);

  if (booking.loading) return <LoadingState label="Loading booking..." />;
  if (booking.error) return <ErrorState message={booking.error} onRetry={booking.retry} />;
  if (!booking.data) return <EmptyState icon="search_off" title="Booking not found" />;

  const b = booking.data;
  const pendingAmount = pendingFor(b);

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>{b.id}</h1>
        <p className="text-soft">{b.date} • {b.collectionType === "home" ? "Home collection" : "Center visit"}</p>
      </div>

      <div className="card">
        {b.items.map((item, i) => (
          <p key={i}>{item.name}</p>
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 4 }}>
        <Row label="Subtotal" value={formatCurrencyInr(b.subtotal)} />
        <Row label="Collection fee" value={formatCurrencyInr(b.collectionFee)} />
        <Row label="Discount" value={`- ${formatCurrencyInr(b.discount)}`} />
        <Row label="Total" value={formatCurrencyInr(b.finalAmount)} bold />
        <Row label="Payment status" value={b.paymentStatus.replace(/_/g, " ")} />
      </div>

      {/* Cash on Home: nothing is collected online, so the amount owed
          is shown as what to hand the collection agent rather than as
          an unfinished payment with a gateway button behind it. */}
      {pendingAmount > 0 && b.bookingStatus !== "cancelled" && (
        <div className="card" style={{ display: "grid", gap: 4 }}>
          <p style={{ fontWeight: 600 }}>Pay {formatCurrencyInr(pendingAmount)} in cash</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Hand this to the collection agent when they visit. Nothing is charged online.
          </p>
        </div>
      )}

      <Link className="btn btn-primary" to={`/track/${b.id}`}>
        Track this booking
      </Link>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

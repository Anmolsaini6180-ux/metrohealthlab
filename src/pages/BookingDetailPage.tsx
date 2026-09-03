import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { getBookingById } from "@/services/bookingService";
import { getAddressById } from "@/services/addressService";
import { getSlotById } from "@/services/slotService";
import { formatCurrencyInr } from "@/services/pricingService";
import { pendingFor } from "@/utils/bookingMetrics";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useAsync(() => getBookingById(id!), [id]);
  const b = booking.data;
  // Both are id-only lookups off the loaded booking — deliberately
  // separate requests rather than a join, since bookingService.ts's
  // own read stays a single BOOKING_SELECT the customer read path
  // already relies on elsewhere (see the tp migration's comment there
  // on why that select is explicit rather than a wildcard).
  const address = useAsync(
    () => (b?.collectionType === "home" && b.addressId ? getAddressById(b.addressId) : Promise.resolve(null)),
    [b?.addressId, b?.collectionType]
  );
  const slot = useAsync(() => (b?.slotId ? getSlotById(b.slotId) : Promise.resolve(null)), [b?.slotId]);

  if (booking.loading) return <LoadingState label="Loading booking..." />;
  if (booking.error) return <ErrorState message={booking.error} onRetry={booking.retry} />;
  if (!b) return <EmptyState icon="search_off" title="Booking not found" />;

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
        <Row label="Slot" value={slot.data ? `${slot.data.startTime} – ${slot.data.endTime}` : slot.loading ? "Loading…" : "—"} />
        {b.collectionType === "home" && (
          <Row
            label="Address"
            value={
              address.data
                ? `${address.data.house}, ${address.data.street}, ${address.data.area}, ${address.data.city} ${address.data.pincode}`
                : address.loading
                  ? "Loading…"
                  : "—"
            }
          />
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 4 }}>
        <Row label="Status" value={b.bookingStatus.replace(/_/g, " ")} />
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

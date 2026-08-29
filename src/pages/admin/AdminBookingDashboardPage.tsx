import { useMemo, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getAdminBookings } from "@/services/adminBookingService";
import { formatCurrencyInr } from "@/services/pricingService";
import {
  computeBookingMetrics,
  filterBookings,
  pendingFor,
  receivedFor,
  toDateKey,
  EMPTY_FILTERS,
  type BookingFilters,
} from "@/utils/bookingMetrics";
import { buildWhatsAppBookingMessage, buildWhatsAppLink } from "@/utils/whatsappBooking";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { CALLABLE_UNAVAILABLE_MESSAGE } from "@/utils/errors";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/admin/StatusBadge";
import type { Booking } from "@/types/booking";

const BOOKING_STATUSES = [
  "confirmed",
  "assigned",
  "on_the_way",
  "arrived",
  "sample_collected",
  "received_at_lab",
  "testing",
  "report_ready",
  "completed",
  "cancelled",
];

const PAYMENT_STATUSES = ["pending", "partially_paid", "paid"];
const SOURCES = ["website", "whatsapp", "admin"];

// Operational view over the booking book. Every figure comes from the
// bookings themselves — there is no separate analytics store to drift
// out of step, and no seeded or sample rows anywhere in this file.
export default function AdminBookingDashboardPage() {
  const { settings } = useBrandingSettings();
  const today = toDateKey(new Date());

  // A wide window: this screen is the whole book, not a date report.
  const bookings = useAsync(
    () => getAdminBookings({ startDate: "2000-01-01", endDate: "2999-12-31" }),
    []
  );

  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Booking | null>(null);

  const rows = bookings.data?.bookings ?? [];
  const metrics = useMemo(() => computeBookingMetrics(rows), [rows]);
  const visible = useMemo(() => filterBookings(rows, filters), [rows, filters]);

  function update<K extends keyof BookingFilters>(key: K, value: BookingFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  // The booking list is a Cloud Function surface (hierarchy scoping
  // cannot be expressed on a Firestore list query). While that function
  // is not deployed this says so plainly rather than showing an empty
  // table that would read as "no bookings yet".
  const backendMissing = bookings.error === CALLABLE_UNAVAILABLE_MESSAGE;

  return (
    <div>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Booking dashboard</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Cash on Home bookings across every source
          </p>
        </div>
      </div>

      {bookings.loading && <LoadingState rows={4} label="Loading bookings..." />}

      {bookings.error && backendMissing && (
        <div className="card" style={{ display: "grid", gap: "var(--space-sm)", borderColor: "var(--color-amber)" }}>
          <p style={{ fontWeight: 700 }}>Booking data requires backend deployment</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Listing bookings needs hierarchy scoping that Firestore rules cannot express on a list
            query, so it runs as a Cloud Function. That function is not deployed on this project
            (Firebase Spark has no Cloud Functions), so there is nothing to show yet — this is not
            an empty booking book.
          </p>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            This screen starts working on its own once the functions are deployed. No rules were
            loosened to fake it.
          </p>
        </div>
      )}

      {bookings.error && !backendMissing && <ErrorState message={bookings.error} onRetry={bookings.retry} />}

      {bookings.data && (
        <>
          <div className="mh-stat-grid" style={{ marginBottom: "var(--space-md)" }}>
            <Kpi label="Total bookings" value={String(metrics.total)} />
            <Kpi label="Today" value={String(metrics.today)} hint={today} />
            <Kpi label="Confirmed" value={String(metrics.confirmed)} />
            <Kpi label="In progress" value={String(metrics.inProgress)} />
            <Kpi label="Completed" value={String(metrics.completed)} />
            <Kpi label="Cancelled" value={String(metrics.cancelled)} />
          </div>

          <div className="mh-stat-grid" style={{ marginBottom: "var(--space-md)" }}>
            <Kpi label="Booking value" value={formatCurrencyInr(metrics.bookingValue)} hint="Agreed, excl. cancelled" />
            <Kpi label="Cash received" value={formatCurrencyInr(metrics.amountReceived)} hint="Actually collected" />
            <Kpi label="Pending amount" value={formatCurrencyInr(metrics.pendingAmount)} hint="Still owed" />
            <Kpi label="Payment pending" value={String(metrics.paymentPending)} />
            <Kpi label="Part paid" value={String(metrics.partiallyPaid)} />
            <Kpi label="Fully paid" value={String(metrics.paid)} />
          </div>

          <div className="mh-filter-row">
            <input
              type="search"
              placeholder="Search booking ID, customer, phone, package..."
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
              style={{ minWidth: 240, flex: 1 }}
            />
            <select value={filters.bookingStatus} onChange={(e) => update("bookingStatus", e.target.value)}>
              <option value="">All booking statuses</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select value={filters.paymentStatus} onChange={(e) => update("paymentStatus", e.target.value)}>
              <option value="">All payment statuses</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select value={filters.source} onChange={(e) => update("source", e.target.value)}>
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {(filters.search || filters.bookingStatus || filters.paymentStatus || filters.source) && (
              <button className="btn btn-outline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
            )}
          </div>

          {rows.length === 0 && <EmptyState icon="calendar_month" title="No bookings yet" />}

          {rows.length > 0 && visible.length === 0 && (
            <EmptyState
              icon="search_off"
              title="No bookings match these filters"
              action={{ label: "Clear filters", onClick: () => setFilters(EMPTY_FILTERS) }}
            />
          )}

          {visible.length > 0 && (
            <div className="mh-scroll-x">
              <table className="mh-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Received</th>
                    <th>Pending</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.id}</td>
                      <td>{b.date}</td>
                      <td>
                        {b.contact?.name ?? "—"}
                        {b.contact?.phone && (
                          <div className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.contact.phone}</div>
                        )}
                      </td>
                      <td>{b.items.map((i) => i.name).join(", ")}</td>
                      <td>{formatCurrencyInr(b.finalAmount)}</td>
                      <td>{formatCurrencyInr(receivedFor(b))}</td>
                      <td style={{ fontWeight: pendingFor(b) > 0 ? 600 : 400 }}>{formatCurrencyInr(pendingFor(b))}</td>
                      <td><StatusBadge status={String(b.paymentStatus)} /></td>
                      <td><StatusBadge status={b.bookingStatus} /></td>
                      <td>{b.source ?? "website"}</td>
                      <td>
                        <button className="btn btn-outline" onClick={() => setSelected(b)}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && (
        <BookingDetail
          booking={selected}
          businessName={settings?.businessName ?? "Metro Health Lab"}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="mh-stat-card">
      <div className="mh-stat-card__value">{value}</div>
      <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{label}</p>
      {hint && <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{hint}</p>}
    </div>
  );
}

function BookingDetail({
  booking,
  businessName,
  onClose,
}: {
  booking: Booking;
  businessName: string;
  onClose: () => void;
}) {
  const message = buildWhatsAppBookingMessage(booking, businessName);
  const waLink = booking.contact?.phone ? buildWhatsAppLink(booking.contact.phone, message) : null;

  return (
    <div className="mh-icon-picker" role="dialog" aria-modal="true" aria-label={`Booking ${booking.id}`} onClick={onClose}>
      <div className="mh-icon-picker__panel card mh-dialog-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="mh-icon-picker__head">
          <p style={{ fontWeight: 700 }}>Booking {booking.id}</p>
          <button type="button" className="icon-btn" aria-label="Close booking" onClick={onClose}>
            <span className="mi">close</span>
          </button>
        </div>

        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <Section title="Customer">
            <Line label="Name" value={booking.contact?.name ?? "—"} />
            <Line label="Phone" value={booking.contact?.phone ?? "—"} />
            <Line label="Address" value={booking.contact?.address ?? "—"} />
          </Section>

          <Section title="Booking">
            <Line label="Collection date" value={booking.date} />
            <Line label="Collection type" value={booking.collectionType} />
            <Line label="Lab" value={booking.labName ?? booking.labId} />
            <Line label="Items" value={booking.items.map((i) => i.name).join(", ")} />
            <Line label="Source" value={booking.source ?? "website"} />
            <Line label="Status" value={booking.bookingStatus.replace(/_/g, " ")} />
          </Section>

          <Section title="Payment">
            <Line label="Method" value="Cash on Home" />
            <Line label="Booking amount" value={formatCurrencyInr(booking.finalAmount)} />
            <Line label="Amount received" value={formatCurrencyInr(receivedFor(booking))} />
            <Line label="Pending amount" value={formatCurrencyInr(pendingFor(booking))} />
            <Line label="Payment status" value={String(booking.paymentStatus).replace(/_/g, " ")} />
          </Section>

          {/* Status changes and cash collection are server-side writes:
              `bookings` is write-denied to every client on purpose, so
              these actions live behind Cloud Functions. Showing buttons
              that cannot work would be worse than saying so. */}
          <div className="card" style={{ borderColor: "var(--color-amber)" }}>
            <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Confirm · Complete · Cancel · Record cash</p>
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              These write to the booking, which is server-only by design. They activate once the
              booking Cloud Functions are deployed.
            </p>
          </div>

          {waLink && (
            <a className="btn btn-outline" href={waLink} target="_blank" rel="noreferrer">
              Share booking on WhatsApp
            </a>
          )}

          <details>
            <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)" }}>Booking summary text</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "var(--text-xs)",
                background: "var(--color-bg-tint)",
                padding: "var(--space-sm)",
                borderRadius: "var(--radius-sm)",
                marginTop: 6,
              }}
            >
              {message}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: 4 }}>{title}</p>
      <div style={{ display: "grid", gap: 2 }}>{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", fontSize: "var(--text-sm)" }}>
      <span className="text-soft">{label}</span>
      <span style={{ textAlign: "right", minWidth: 0, wordBreak: "break-word" }}>{value}</span>
    </p>
  );
}

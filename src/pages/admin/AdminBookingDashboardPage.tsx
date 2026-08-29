import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToAdminBookings } from "@/services/bookingService";
import { recordCashReceived, setBookingStatus } from "@/services/adminBookingWriteService";
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
import { logOperationError, toUserMessage } from "@/utils/errors";
import { clampReceived } from "@/utils/cashState";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/admin/StatusBadge";
import AddBookingDialog from "@/pages/admin/AddBookingDialog";
import { useToast } from "@/hooks/useToast";
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

// One place deciding how a source reads, so the badge, the filter and
// the detail dialog cannot describe the same booking differently.
const SOURCE_LABELS: Record<string, string> = {
  website: "\u{1F310} Website",
  whatsapp: "\u{1F4AC} WhatsApp",
  admin: "\u{1F6E0}\uFE0F Admin",
};

function sourceLabel(source: string | undefined): string {
  return SOURCE_LABELS[source ?? "website"] ?? (source ?? "website");
}

// Operational view over the booking book. Every figure comes from the
// bookings themselves — there is no separate analytics store to drift
// out of step, and no seeded or sample rows anywhere in this file.
export default function AdminBookingDashboardPage() {
  const { settings } = useBrandingSettings();
  const { user } = useAuth();
  const today = toDateKey(new Date());

  // Live listener straight onto the bookings collection. firestore.rules
  // allows this unscoped list only for SUPER_ADMIN/ADMIN, so it is the
  // rules — not this component — that keep it from being a data leak.
  // A booking created anywhere (website, WhatsApp, admin) lands here
  // with no refresh.
  const bookings = useRealtimeQuery(subscribeToAdminBookings, []);

  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [adding, setAdding] = useState(false);
  const { showToast } = useToast();

  const rows = bookings.data ?? [];
  const metrics = useMemo(() => computeBookingMetrics(rows), [rows]);
  const visible = useMemo(() => filterBookings(rows, filters), [rows, filters]);

  // The dialog reads from the live rows rather than the row captured on
  // click, so an edit made here (or by anyone else) is reflected
  // immediately instead of showing a stale copy.
  const openBooking = selected ? (rows.find((b) => b.id === selected.id) ?? selected) : null;

  function update<K extends keyof BookingFilters>(key: K, value: BookingFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }


  return (
    <div>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Booking dashboard</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Cash on Home bookings across every source
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          + Add Booking
        </button>
      </div>

      {bookings.loading && <LoadingState rows={4} label="Loading bookings..." />}

      {bookings.error && <ErrorState message={bookings.error} onRetry={bookings.retry} />}


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
                <option key={s} value={s}>{sourceLabel(s)}</option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Collection date"
              value={filters.date}
              onChange={(e) => update("date", e.target.value)}
            />
            {(filters.search || filters.bookingStatus || filters.paymentStatus || filters.source || filters.date) && (
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
                      <td style={{ whiteSpace: "nowrap" }}>{sourceLabel(b.source)}</td>
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

      {adding && (
        <AddBookingDialog
          actorUid={user?.uid ?? ""}
          onClose={() => setAdding(false)}
          onCreated={(bookingId) => {
            setAdding(false);
            // The listener delivers the new row on its own; this is just
            // confirmation that the write landed.
            showToast(`Booking ${bookingId} created`);
          }}
        />
      )}

      {openBooking && (
        <BookingDetail
          booking={openBooking}
          actorUid={user?.uid ?? ""}
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
  actorUid,
  businessName,
  onClose,
}: {
  booking: Booking;
  actorUid: string;
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
            <Line label="Source" value={sourceLabel(booking.source)} />
            <Line label="Status" value={booking.bookingStatus.replace(/_/g, " ")} />
          </Section>

          <Section title="Payment">
            <Line label="Method" value="Cash on Home" />
            <Line label="Booking amount" value={formatCurrencyInr(booking.finalAmount)} />
            <Line label="Amount received" value={formatCurrencyInr(receivedFor(booking))} />
            <Line label="Pending amount" value={formatCurrencyInr(pendingFor(booking))} />
            <Line label="Payment status" value={String(booking.paymentStatus).replace(/_/g, " ")} />
          </Section>

          <BookingActions booking={booking} actorUid={actorUid} />

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

// Status moves and cash collection, written straight to Firestore.
// firestore.rules re-checks the cash arithmetic and pins which keys an
// update may touch, so a mistake here is refused rather than stored.
function BookingActions({ booking, actorUid }: { booking: Booking; actorUid: string }) {
  const [received, setReceived] = useState(String(receivedFor(booking)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const terminal = booking.bookingStatus === "cancelled" || booking.bookingStatus === "refunded";

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setSaved(null);
    try {
      await action();
      setSaved(label);
    } catch (err) {
      logOperationError(`booking.${label}`, err, { bookingId: booking.id });
      setError(toUserMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const parsed = clampReceived(booking.finalAmount, Number(received));

  return (
    <div className="card" style={{ display: "grid", gap: "var(--space-sm)" }}>
      <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>Actions</p>

      <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
        <button
          className="btn btn-outline"
          disabled={busy !== null || terminal || booking.bookingStatus === "confirmed"}
          onClick={() => run("confirm", () => setBookingStatus(actorUid, booking, "confirmed"))}
        >
          Confirm
        </button>
        <button
          className="btn btn-outline"
          disabled={busy !== null || terminal || booking.bookingStatus === "completed"}
          onClick={() => run("complete", () => setBookingStatus(actorUid, booking, "completed"))}
        >
          Mark completed
        </button>
        <button
          className="btn btn-danger"
          disabled={busy !== null || terminal}
          onClick={() => run("cancel", () => setBookingStatus(actorUid, booking, "cancelled"))}
        >
          Cancel
        </button>
      </div>

      {/* Cumulative total collected, not a delta — so re-saving the same
          figure is a no-op rather than a double count. */}
      <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
        Cash received (total of {formatCurrencyInr(booking.finalAmount)})
        <div style={{ display: "flex", gap: "var(--space-xs)" }}>
          <input
            type="number"
            min={0}
            max={booking.finalAmount}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            disabled={busy !== null || terminal}
            onClick={() => run("cash", () => recordCashReceived(actorUid, booking, parsed))}
          >
            {busy === "cash" ? "Saving..." : "Record"}
          </button>
        </div>
      </label>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
        Pending after saving: {formatCurrencyInr(Math.max(booking.finalAmount - parsed, 0))}
      </p>

      {terminal && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          This booking is {booking.bookingStatus}; cash can no longer be recorded against it.
        </p>
      )}
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      {saved && !error && (
        <p style={{ color: "var(--color-success)", fontSize: "var(--text-sm)" }}>Saved.</p>
      )}
    </div>
  );
}

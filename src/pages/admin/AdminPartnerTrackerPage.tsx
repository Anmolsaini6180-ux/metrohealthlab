import { useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import {
  addAdSpend,
  addPartner,
  addPayout,
  addSettlement,
  deleteAdSpend,
  deletePayout,
  deleteSettlement,
  getAdSpend,
  getPartners,
  getPayouts,
  getSettlements,
  getTrackerBookings,
  saveBookingFinance,
  updatePartner,
} from "@/services/adminPartnerTrackerService";
import { formatCurrencyInr } from "@/services/pricingService";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import { downloadCsv } from "@/utils/csvExport";
import { toUserMessage } from "@/utils/errors";
import { calcBooking, healthiansPosition, partnerLedger, summarize } from "@/utils/partnerTrackerMath";
import type { ReceivedAt, TrackerBooking, TrackerPartner } from "@/types/partnerTracker";
import DateRangePicker from "@/components/admin/DateRangePicker";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import Metric from "@/components/admin/MetricCard";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import AddBookingDialog from "./AddBookingDialog";

// Partner Tracker — SUPER_ADMIN only. Reads the real bookings table and
// layers the partner / TP / Healthians / ad-spend facts on top of it
// (see supabase/partner_tracker.sql). Every money rule lives in
// utils/partnerTrackerMath.ts; this page only formats and edits.
//
// The role check below is UX. The real gate is RLS + the RPC's own
// is_super_admin() check, so a non-super-admin who reaches this page
// some other way still reads and writes nothing.

type Tab = "dashboard" | "bookings" | "partners" | "payouts" | "healthians" | "ads";
const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "bookings", label: "Bookings" },
  { id: "partners", label: "Partners" },
  { id: "payouts", label: "Payouts" },
  { id: "healthians", label: "Healthians" },
  { id: "ads", label: "Meta Ads" },
];

const inr = formatCurrencyInr;
const today = () => new Date().toISOString().slice(0, 10);
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--space-sm)", alignItems: "end" } as const;

export default function AdminPartnerTrackerPage() {
  const { role, loading, uid } = useAdminRole();
  if (loading) return <LoadingState label="Checking access..." />;
  if (role !== "SUPER_ADMIN") return <Navigate to="/admin" replace />;
  return <TrackerApp actorUid={uid} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: "var(--text-xs)" }}>
      <span className="text-soft">{label}</span>
      {children}
    </label>
  );
}

function TrackerApp({ actorUid }: { actorUid: string }) {
  const { showToast } = useToast();
  const bookings = useAsync(getTrackerBookings, []);
  const partners = useAsync(getPartners, []);
  const payouts = useAsync(getPayouts, []);
  const settlements = useAsync(getSettlements, []);
  const ads = useAsync(getAdSpend, []);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const [editing, setEditing] = useState<TrackerBooking | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; run: () => Promise<void> } | null>(null);

  const all = bookings.data ?? [];
  const partnerList = partners.data ?? [];
  const payoutList = payouts.data ?? [];
  const settlementList = settlements.data ?? [];
  const adList = ads.data ?? [];

  const firstError = bookings.error || partners.error || payouts.error || settlements.error || ads.error;
  const firstLoad = !firstError && (bookings.loading || partners.loading) && !bookings.data;

  function reloadAll() {
    bookings.retry();
    partners.retry();
    payouts.retry();
    settlements.retry();
    ads.retry();
  }

  async function act(fn: () => Promise<void>, okMessage: string) {
    try {
      await fn();
      showToast(okMessage);
      reloadAll();
    } catch (err) {
      showToast(toUserMessage(err), "error");
    }
  }

  function askDelete(message: string, fn: () => Promise<void>) {
    setConfirm({ message, run: () => act(fn, "Deleted.") });
  }

  const inRange = useMemo(() => all.filter((b) => b.date >= range.startDate && b.date <= range.endDate), [all, range]);
  const adsInRange = useMemo(() => adList.filter((a) => a.spentOn >= range.startDate && a.spentOn <= range.endDate), [adList, range]);
  const summary = useMemo(() => summarize(inRange, partnerList, adsInRange), [inRange, partnerList, adsInRange]);
  const ledger = useMemo(() => partnerLedger(all, partnerList, payoutList), [all, partnerList, payoutList]);
  const hp = useMemo(() => healthiansPosition(all, partnerList, settlementList), [all, partnerList, settlementList]);
  const unpaid = ledger.reduce((a, r) => a + r.outstanding, 0);

  const showRange = tab === "dashboard" || tab === "bookings" || tab === "ads";

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Partner Tracker</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Real bookings with partner commission, TP / Healthians balance and Meta Ads spend. Super admin only.
          </p>
        </div>
        {tab === "bookings" && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add booking</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} className={`btn ${tab === t.id ? "btn-primary" : "btn-outline"}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {showRange && <DateRangePicker onChange={(r) => setRange(r)} />}

      {firstLoad && <LoadingState label="Loading tracker..." rows={3} />}
      {firstError && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <ErrorState message={firstError} onRetry={reloadAll} />
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            First time here? The tracker tables must exist in Supabase — run supabase/partner_tracker.sql once in the SQL editor, then retry.
          </p>
        </div>
      )}

      {!firstError && !firstLoad && tab === "dashboard" && (
        <div className="mh-dash-section">
          <p className="mh-dash-section__title">Selected range</p>
          <div className="mh-metric-grid">
            <Metric icon="calendar_month" label="Bookings" value={`${summary.bookings - summary.cancelled}${summary.cancelled ? ` (+${summary.cancelled} cancelled)` : ""}`} />
            <Metric icon="trending_up" label="Revenue" value={inr(summary.revenue)} />
            <Metric icon="local_shipping" label="Lab / TP cost" value={inr(summary.cost)} muted />
            <Metric icon="handshake" label="Partner commission payable" value={inr(summary.partnerPayable)} tone="warning" />
            <Metric icon="request_quote" label="Our TP commission" value={inr(summary.ourTpCommission)} tone="success" />
            <Metric icon="account_balance" label="Net margin" value={inr(summary.net)} tone={summary.net >= 0 ? "success" : "danger"} />
            <Metric icon="campaign" label="Meta ad spend" value={inr(summary.adSpend)} muted />
            <Metric icon="savings" label="Net after ads" value={inr(summary.netAfterAds)} tone={summary.netAfterAds >= 0 ? "success" : "danger"} />
            <Metric icon="ads_click" label="Ad cost / booking" value={summary.adCostPerBooking == null ? "—" : inr(summary.adCostPerBooking)} muted />
          </div>
          <p className="mh-dash-section__title" style={{ marginTop: "var(--space-md)" }}>All time</p>
          <div className="mh-metric-grid">
            <Metric icon="hourglass_top" label="Unpaid partner commission" value={inr(unpaid)} tone={unpaid > 0 ? "warning" : "success"} />
            <Metric
              icon="sync_alt"
              label={hp.net >= 0 ? "Healthians owes us" : "We owe Healthians"}
              value={inr(Math.abs(hp.net))}
              tone={hp.net >= 0 ? "warning" : "danger"}
            />
          </div>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Cancelled and refunded bookings are excluded. Own-booking cost uses the booking&apos;s recorded TP unless you override it.
          </p>
        </div>
      )}

      {!firstError && !firstLoad && tab === "bookings" && (
        <BookingsTab
          rows={inRange}
          partners={partnerList}
          onEdit={setEditing}
          onExport={() =>
            downloadCsv(`partner-tracker-bookings-${range.startDate}_to_${range.endDate}`, inRange, [
              { header: "Date", value: (b) => b.date },
              { header: "Reference", value: (b) => b.reference },
              { header: "Patient", value: (b) => b.patientName },
              { header: "Phone", value: (b) => b.phone },
              { header: "City", value: (b) => b.city },
              { header: "Items", value: (b) => b.items },
              { header: "Partner", value: (b) => partnerList.find((p) => p.id === b.partnerId)?.name ?? "" },
              { header: "Type", value: (b) => (b.isTp ? "TP" : b.partnerId ? "Partner %" : "Own") },
              { header: "Received at", value: (b) => b.receivedAt ?? "" },
              { header: "Billed", value: (b) => calcBooking(b, partnerList).billed },
              { header: "Cost / TP", value: (b) => calcBooking(b, partnerList).cost },
              { header: "Partner payable", value: (b) => calcBooking(b, partnerList).partnerPayable },
              { header: "Our TP commission", value: (b) => calcBooking(b, partnerList).ourTpCommission },
              { header: "Net", value: (b) => calcBooking(b, partnerList).net },
              { header: "Status", value: (b) => b.bookingStatus },
            ])
          }
        />
      )}

      {!firstError && !firstLoad && tab === "partners" && (
        <PartnersTab
          ledger={ledger}
          onAdd={(input) => act(() => addPartner(input), "Partner added.")}
          onUpdate={(id, patch) => act(() => updatePartner(id, patch), "Updated.")}
        />
      )}

      {!firstError && !firstLoad && tab === "payouts" && (
        <PayoutsTab
          partners={partnerList}
          payouts={payoutList}
          onAdd={(input) => act(() => addPayout(input), "Payout recorded.")}
          onDelete={(id) => askDelete("Delete this payout? The partner's outstanding balance goes back up.", () => deletePayout(id))}
        />
      )}

      {!firstError && !firstLoad && tab === "healthians" && (
        <HealthiansTab
          bookings={all}
          partners={partnerList}
          position={hp}
          settlements={settlementList}
          onChangeReceived={(b, receivedAt) =>
            act(
              () =>
                saveBookingFinance(b.bookingId, {
                  partnerId: b.partnerId, isTp: b.isTp, tpAmount: b.tpAmount, partnerPayment: b.partnerPayment,
                  labCost: b.labCost, receivedAt, notes: b.notes,
                }),
              "Updated."
            )
          }
          onAdd={(input) => act(() => addSettlement(input), "Settlement recorded.")}
          onDelete={(id) => askDelete("Delete this settlement?", () => deleteSettlement(id))}
        />
      )}

      {!firstError && !firstLoad && tab === "ads" && (
        <AdsTab
          rows={adsInRange}
          total={summary.adSpend}
          onAdd={(input) => act(() => addAdSpend(input), "Ad spend saved.")}
          onDelete={(id) => askDelete("Delete this ad spend entry?", () => deleteAdSpend(id))}
        />
      )}

      {editing && (
        <BookingFinanceDialog
          booking={editing}
          partners={partnerList}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadAll(); showToast("Saved."); }}
        />
      )}

      {adding && (
        <AddBookingDialog
          actorUid={actorUid}
          onClose={() => setAdding(false)}
          onCreated={() => { reloadAll(); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Are you sure?"
          message={confirm.message}
          confirmLabel="Delete"
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const run = confirm.run; setConfirm(null); void run(); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------ bookings
type TypeFilter = "all" | "own" | "partner" | "tp";

function typeOf(b: TrackerBooking): Exclude<TypeFilter, "all"> {
  return b.isTp ? "tp" : b.partnerId ? "partner" : "own";
}

function BookingsTab({ rows, partners, onEdit, onExport }: { rows: TrackerBooking[]; partners: TrackerPartner[]; onEdit: (b: TrackerBooking) => void; onExport: () => void }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const shown = rows.filter((b) => {
    if (type !== "all" && typeOf(b) !== type) return false;
    const hay = `${b.patientName} ${b.phone} ${b.city} ${b.items} ${b.reference}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });

  return (
    <div className="card" style={{ display: "grid", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <input style={{ flex: "1 1 200px" }} placeholder="Search patient, phone, city, reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
          <option value="all">All types</option>
          <option value="own">Own bookings</option>
          <option value="partner">Partner bookings</option>
          <option value="tp">TP bookings</option>
        </select>
        <button className="btn btn-outline" onClick={onExport} disabled={rows.length === 0}>Export CSV</button>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No bookings" description="Nothing in this date range matches. Use + Add booking, or widen the range." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="mh-table">
            <thead>
              <tr>
                <th>Date</th><th>Ref</th><th>Patient</th><th>City</th><th>Partner</th><th>Type</th><th>Received at</th>
                <th style={{ textAlign: "right" }}>Billed</th><th style={{ textAlign: "right" }}>Partner payable</th>
                <th style={{ textAlign: "right" }}>Net</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const c = calcBooking(b, partners);
                const partner = partners.find((p) => p.id === b.partnerId)?.name;
                return (
                  <tr key={b.bookingId}>
                    <td>{b.date}</td>
                    <td>{b.reference}</td>
                    <td>{b.patientName || "—"}<div className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{b.phone}</div></td>
                    <td>{b.city || "—"}</td>
                    <td>{partner ?? "Mine"}</td>
                    <td>{b.isTp ? <>TP <span className="text-soft">(earn {inr(c.ourTpCommission)})</span></> : b.partnerId ? "Partner %" : "Own"}</td>
                    <td>{b.receivedAt === "healthians" ? "Healthians" : b.receivedAt === "self" ? "Self" : "—"}</td>
                    <td style={{ textAlign: "right" }}>{inr(b.billed)}</td>
                    <td style={{ textAlign: "right" }}>{inr(c.partnerPayable)}</td>
                    <td style={{ textAlign: "right" }}>{inr(c.net)}</td>
                    <td>{b.bookingStatus.replace(/_/g, " ")}</td>
                    <td><button className="btn btn-outline" onClick={() => onEdit(b)}>Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BookingFinanceDialog({ booking, partners, onClose, onSaved }: { booking: TrackerBooking; partners: TrackerPartner[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [partnerId, setPartnerId] = useState(booking.partnerId ?? "");
  const [isTp, setIsTp] = useState(booking.isTp);
  const [tpAmount, setTpAmount] = useState(booking.tpAmount == null ? "" : String(booking.tpAmount));
  const [partnerPayment, setPartnerPayment] = useState(String(booking.partnerPayment || ""));
  const [labCost, setLabCost] = useState(booking.labCost == null ? "" : String(booking.labCost));
  const [receivedAt, setReceivedAt] = useState<ReceivedAt | "">(booking.receivedAt ?? "");
  const [notes, setNotes] = useState(booking.notes);
  const [busy, setBusy] = useState(false);

  const draft: TrackerBooking = {
    ...booking,
    partnerId: partnerId || null,
    isTp,
    tpAmount: tpAmount === "" ? null : Number(tpAmount),
    partnerPayment: Number(partnerPayment) || 0,
    labCost: labCost === "" ? null : Number(labCost),
    receivedAt: receivedAt || null,
  };
  const preview = calcBooking(draft, partners);
  const selectable = partners.filter((p) => p.active || p.id === booking.partnerId);

  async function save() {
    if (draft.partnerPayment > 0 && !draft.partnerId) {
      showToast("Pick the partner this payment is for.", "error");
      return;
    }
    if ([draft.tpAmount, draft.labCost].some((v) => v != null && (Number.isNaN(v) || v < 0)) || Number.isNaN(draft.partnerPayment)) {
      showToast("Amounts must be zero or more.", "error");
      return;
    }
    setBusy(true);
    try {
      await saveBookingFinance(booking.bookingId, {
        partnerId: draft.partnerId, isTp, tpAmount: draft.tpAmount, partnerPayment: draft.partnerPayment,
        labCost: draft.labCost, receivedAt: draft.receivedAt, notes,
      });
      onSaved();
    } catch (err) {
      showToast(toUserMessage(err), "error");
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-md)" }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto", display: "grid", gap: "var(--space-md)" }} onClick={(e) => e.stopPropagation()}>
        <div>
          <p style={{ fontWeight: 700 }}>{booking.reference} — {booking.patientName || "Booking"}</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>Billed {inr(booking.billed)}{booking.itemsTp != null ? ` · recorded TP ${inr(booking.itemsTp)}` : ""}</p>
        </div>
        <div style={gridStyle}>
          <Field label="Partner">
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">My booking (no partner)</option>
              {selectable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select value={isTp ? "tp" : "pct"} onChange={(e) => setIsTp(e.target.value === "tp")}>
              <option value="pct">Partner % commission</option>
              <option value="tp">TP booking (Healthians)</option>
            </select>
          </Field>
          {isTp ? (
            <>
              <Field label={`TP amount${booking.itemsTp != null ? ` (blank = ${inr(booking.itemsTp)})` : ""}`}>
                <input type="number" min="0" inputMode="decimal" value={tpAmount} onChange={(e) => setTpAmount(e.target.value)} />
              </Field>
              <Field label="Partner payment">
                <input type="number" min="0" inputMode="decimal" value={partnerPayment} onChange={(e) => setPartnerPayment(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label={`Lab cost${booking.itemsTp != null ? ` (blank = ${inr(booking.itemsTp)})` : ""}`}>
              <input type="number" min="0" inputMode="decimal" value={labCost} onChange={(e) => setLabCost(e.target.value)} />
            </Field>
          )}
          <Field label="Payment received at">
            <select value={receivedAt} onChange={(e) => setReceivedAt(e.target.value as ReceivedAt | "")}>
              <option value="">Not received</option>
              <option value="healthians">Healthians</option>
              <option value="self">Self</option>
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p style={{ fontWeight: 600 }}>
          {isTp
            ? `Commission = ${inr(booking.billed)} − ${inr(draft.tpAmount ?? booking.itemsTp ?? 0)} − ${inr(draft.partnerPayment)} = ${inr(preview.ourTpCommission)}`
            : `Partner payable ${inr(preview.partnerPayable)} · Net ${inr(preview.net)}`}
        </p>
        <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ partners
function PartnersTab({ ledger, onAdd, onUpdate }: {
  ledger: ReturnType<typeof partnerLedger>;
  onAdd: (i: { name: string; phone?: string; commissionRate: number }) => void;
  onUpdate: (id: string, patch: { commissionRate?: number; active?: boolean }) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("");

  function submit() {
    const r = Number(rate);
    if (!name.trim() || rate === "" || Number.isNaN(r) || r < 0 || r > 100) {
      showToast("Enter a name and a commission between 0 and 100.", "error");
      return;
    }
    onAdd({ name, phone, commissionRate: r });
    setName(""); setPhone(""); setRate("");
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <div className="card" style={gridStyle}>
        <Field label="Partner name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Commission %"><input type="number" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <button className="btn btn-primary" onClick={submit}>Add partner</button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="mh-table">
          <thead>
            <tr><th>Partner</th><th>Rate %</th><th style={{ textAlign: "right" }}>Bookings</th><th style={{ textAlign: "right" }}>Earned</th><th style={{ textAlign: "right" }}>Paid</th><th style={{ textAlign: "right" }}>Outstanding</th><th>Active</th></tr>
          </thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={r.partner.id}>
                <td>{r.partner.name}{r.partner.phone && <div className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{r.partner.phone}</div>}</td>
                <td>
                  <input
                    type="number" min="0" max="100" style={{ width: 80 }} defaultValue={r.partner.commissionRate}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (e.target.value !== "" && v >= 0 && v <= 100 && v !== r.partner.commissionRate) onUpdate(r.partner.id, { commissionRate: v });
                    }}
                  />
                </td>
                <td style={{ textAlign: "right" }}>{r.bookings}</td>
                <td style={{ textAlign: "right" }}>{inr(r.earned)}</td>
                <td style={{ textAlign: "right" }}>{inr(r.paid)}</td>
                <td style={{ textAlign: "right" }}>{inr(r.outstanding)}</td>
                <td><input type="checkbox" checked={r.partner.active} onChange={(e) => onUpdate(r.partner.id, { active: e.target.checked })} aria-label={`${r.partner.name} active`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {ledger.length === 0 && <EmptyState title="No partners yet" description="Add your first partner above." />}
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-sm)" }}>
          A rate change applies to every booking of that partner, past and future. Earned/paid are all-time.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- payouts
function PayoutsTab({ partners, payouts, onAdd, onDelete }: {
  partners: TrackerPartner[];
  payouts: { id: string; partnerId: string; paidOn: string; amount: number; reference: string }[];
  onAdd: (i: { partnerId: string; paidOn: string; amount: number; reference?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [partnerId, setPartnerId] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  function submit() {
    const a = Number(amount);
    if (!partnerId || !(a > 0)) {
      showToast("Pick a partner and enter an amount above zero.", "error");
      return;
    }
    onAdd({ partnerId, paidOn, amount: a, reference });
    setAmount(""); setReference("");
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <div className="card" style={gridStyle}>
        <Field label="Partner">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">Select partner</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="Amount ₹"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Ref / UTR (optional)"><input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <button className="btn btn-primary" onClick={submit}>Save payout</button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {payouts.length === 0 ? (
          <EmptyState title="No payouts yet" description="Payouts you record reduce each partner's outstanding balance." />
        ) : (
          <table className="mh-table">
            <thead><tr><th>Date</th><th>Partner</th><th style={{ textAlign: "right" }}>Amount</th><th>Ref</th><th /></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.paidOn}</td>
                  <td>{partners.find((x) => x.id === p.partnerId)?.name ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{inr(p.amount)}</td>
                  <td>{p.reference}</td>
                  <td><button className="btn btn-outline" onClick={() => onDelete(p.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- healthians
function HealthiansTab({ bookings, partners, position, settlements, onChangeReceived, onAdd, onDelete }: {
  bookings: TrackerBooking[];
  partners: TrackerPartner[];
  position: ReturnType<typeof healthiansPosition>;
  settlements: { id: string; direction: "in" | "out"; settledOn: string; amount: number; reference: string }[];
  onChangeReceived: (b: TrackerBooking, r: ReceivedAt | null) => void;
  onAdd: (i: { direction: "in" | "out"; settledOn: string; amount: number; reference?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [settledOn, setSettledOn] = useState(today());
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const tpRows = bookings.filter((b) => b.isTp);

  function submit() {
    const a = Number(amount);
    if (!(a > 0)) {
      showToast("Enter an amount above zero.", "error");
      return;
    }
    onAdd({ direction, settledOn, amount: a, reference });
    setAmount(""); setReference("");
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <div className="mh-metric-grid">
        <Metric icon="south_west" label="To receive from Healthians" value={inr(position.toReceive)} tone="warning" />
        <Metric icon="north_east" label="To pay Healthians" value={inr(position.toPay)} muted />
        <Metric icon="swap_vert" label="Settled (received / paid)" value={`${inr(position.settledIn)} / ${inr(position.settledOut)}`} muted />
        <Metric icon="sync_alt" label={position.net >= 0 ? "Net: Healthians owes us" : "Net: we owe Healthians"} value={inr(Math.abs(position.net))} tone={position.net >= 0 ? "warning" : "danger"} />
      </div>
      <div className="card" style={gridStyle}>
        <Field label="Settlement">
          <select value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
            <option value="in">Received from Healthians</option>
            <option value="out">Paid to Healthians</option>
          </select>
        </Field>
        <Field label="Date"><input type="date" value={settledOn} onChange={(e) => setSettledOn(e.target.value)} /></Field>
        <Field label="Amount ₹"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Ref / UTR (optional)"><input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <button className="btn btn-primary" onClick={submit}>Save settlement</button>
      </div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
        Collected by Healthians: they owe you billed − TP amount. Collected by Self: you owe Healthians the TP amount.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <p style={{ fontWeight: 600, marginBottom: "var(--space-sm)" }}>TP bookings (all time)</p>
        {tpRows.length === 0 ? (
          <EmptyState title="No TP bookings" description="Mark a booking as a TP booking from the Bookings tab." />
        ) : (
          <table className="mh-table">
            <thead><tr><th>Date</th><th>Patient</th><th style={{ textAlign: "right" }}>Billed</th><th style={{ textAlign: "right" }}>TP</th><th>Received at</th><th style={{ textAlign: "right" }}>Pending</th></tr></thead>
            <tbody>
              {tpRows.map((b) => {
                const c = calcBooking(b, partners);
                return (
                  <tr key={b.bookingId}>
                    <td>{b.date}</td>
                    <td>{b.patientName || b.reference}</td>
                    <td style={{ textAlign: "right" }}>{inr(b.billed)}</td>
                    <td style={{ textAlign: "right" }}>{inr(c.cost)}</td>
                    <td>
                      <select value={b.receivedAt ?? ""} onChange={(e) => onChangeReceived(b, (e.target.value || null) as ReceivedAt | null)}>
                        <option value="">Not received</option>
                        <option value="healthians">Healthians</option>
                        <option value="self">Self</option>
                      </select>
                    </td>
                    <td style={{ textAlign: "right" }}>{c.healthiansBalance > 0 ? `Receive ${inr(c.healthiansBalance)}` : c.healthiansBalance < 0 ? `Pay ${inr(-c.healthiansBalance)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <p style={{ fontWeight: 600, marginBottom: "var(--space-sm)" }}>Settlements</p>
        {settlements.length === 0 ? (
          <EmptyState title="No settlements yet" description="Record money received from or paid to Healthians above." />
        ) : (
          <table className="mh-table">
            <thead><tr><th>Date</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th>Ref</th><th /></tr></thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id}>
                  <td>{s.settledOn}</td>
                  <td>{s.direction === "in" ? "Received" : "Paid"}</td>
                  <td style={{ textAlign: "right" }}>{inr(s.amount)}</td>
                  <td>{s.reference}</td>
                  <td><button className="btn btn-outline" onClick={() => onDelete(s.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- meta ads
function AdsTab({ rows, total, onAdd, onDelete }: {
  rows: { id: string; spentOn: string; campaign: string; amount: number; leads: number }[];
  total: number;
  onAdd: (i: { spentOn: string; campaign?: string; amount: number; leads?: number }) => void;
  onDelete: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [spentOn, setSpentOn] = useState(today());
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [leads, setLeads] = useState("");
  const withLeads = rows.filter((r) => r.leads > 0);
  const leadSpend = withLeads.reduce((a, r) => a + r.amount, 0);
  const leadCount = withLeads.reduce((a, r) => a + r.leads, 0);

  function submit() {
    const a = Number(amount);
    if (amount === "" || Number.isNaN(a) || a < 0) {
      showToast("Enter the spend amount.", "error");
      return;
    }
    onAdd({ spentOn, campaign, amount: a, leads: Number(leads) || 0 });
    setAmount(""); setCampaign(""); setLeads("");
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <div className="card" style={gridStyle}>
        <Field label="Date"><input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} /></Field>
        <Field label="Campaign (optional)"><input value={campaign} onChange={(e) => setCampaign(e.target.value)} /></Field>
        <Field label="Spend ₹"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Leads (optional)"><input type="number" min="0" value={leads} onChange={(e) => setLeads(e.target.value)} /></Field>
        <button className="btn btn-primary" onClick={submit}>Save</button>
      </div>
      <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
        Selected range: {inr(total)}{leadCount > 0 ? ` · avg cost / lead ${inr(leadSpend / leadCount)}` : ""}
      </p>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
        Finance already adds Campaign spend into expenses. Enter a given Meta spend here OR on the Campaign, not both, or it is counted twice.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <EmptyState title="No ad spend" description="Nothing recorded in this date range." />
        ) : (
          <table className="mh-table">
            <thead><tr><th>Date</th><th>Campaign</th><th style={{ textAlign: "right" }}>Spend</th><th style={{ textAlign: "right" }}>Leads</th><th style={{ textAlign: "right" }}>Cost / lead</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.spentOn}</td>
                  <td>{r.campaign || "—"}</td>
                  <td style={{ textAlign: "right" }}>{inr(r.amount)}</td>
                  <td style={{ textAlign: "right" }}>{r.leads || "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.leads > 0 ? inr(r.amount / r.leads) : "—"}</td>
                  <td><button className="btn btn-outline" onClick={() => onDelete(r.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

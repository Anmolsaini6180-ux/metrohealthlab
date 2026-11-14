import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import {
  getFinanceReport,
  getFinancialTransactions,
  getPendingCollections,
  recordFinancialTransaction,
} from "@/services/adminFinanceService";
import { getCampaignPerformance } from "@/services/adminMarketingService";
import { formatCurrencyInr } from "@/services/pricingService";
import { resolveDateRange, shortDayLabel, type DateRange } from "@/utils/dateRanges";
import { downloadCsv } from "@/utils/csvExport";
import {
  ADJUSTMENT_CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  type FinancialTransaction,
  type PendingCollection,
  type RecordTransactionInput,
  type TransactionType,
} from "@/types/finance";
import type { CampaignPerformance } from "@/types/finance";
import DateRangePicker from "@/components/admin/DateRangePicker";
import TrendChart from "@/components/admin/TrendChart";
import BarList from "@/components/admin/BarList";
import Metric from "@/components/admin/MetricCard";
import StatusBadge from "@/components/admin/StatusBadge";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

// Every card below traces back to one real SQL aggregate from
// get_finance_report() (see adminFinanceService.ts's own header
// comment) — this page never recomputes a money figure itself, only
// formats and charts what the RPC already computed.
export default function AdminFinancePage() {
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const report = useAsync(() => getFinanceReport(range.startDate, range.endDate), [range.startDate, range.endDate]);
  const transactions = useAsync(() => getFinancialTransactions(range.startDate, range.endDate), [range.startDate, range.endDate]);
  const collections = useAsync(getPendingCollections, []);
  const campaignPerf = useAsync(() => getCampaignPerformance(range.startDate, range.endDate), [range.startDate, range.endDate]);
  const [showAddTxn, setShowAddTxn] = useState(false);

  function refreshAll() {
    report.retry();
    transactions.retry();
  }

  function exportTransactionsCsv() {
    downloadCsv(`finance-transactions-${range.startDate}_to_${range.endDate}`, transactions.data?.rows ?? [], [
      { header: "Date", value: (t: FinancialTransaction) => t.occurredOn },
      { header: "Type", value: (t: FinancialTransaction) => t.type },
      { header: "Category", value: (t: FinancialTransaction) => t.category },
      { header: "Amount", value: (t: FinancialTransaction) => t.amount },
      { header: "Description", value: (t: FinancialTransaction) => t.description ?? "" },
      { header: "Reference", value: (t: FinancialTransaction) => t.reference ?? "" },
      { header: "Payment Method", value: (t: FinancialTransaction) => t.paymentMethod ?? "" },
      { header: "Notes", value: (t: FinancialTransaction) => t.notes ?? "" },
    ]);
  }

  function exportCollectionsCsv() {
    downloadCsv("pending-collections", collections.data?.rows ?? [], [
      { header: "Booking ID", value: (r: PendingCollection) => r.bookingId },
      { header: "Date", value: (r: PendingCollection) => r.date },
      { header: "Customer", value: (r: PendingCollection) => r.customerName },
      { header: "Final Amount", value: (r: PendingCollection) => r.finalAmount },
      { header: "Received", value: (r: PendingCollection) => r.amountReceived },
      { header: "Outstanding", value: (r: PendingCollection) => r.outstanding },
      { header: "Assigned Agent", value: (r: PendingCollection) => r.assignedAgentName ?? "" },
      { header: "Status", value: (r: PendingCollection) => r.bookingStatus },
    ]);
  }

  function exportRevenueCsv() {
    downloadCsv(`finance-revenue-${range.startDate}_to_${range.endDate}`, report.data?.daily ?? [], [
      { header: "Date", value: (d) => d.day },
      { header: "Revenue", value: (d) => d.revenue },
      { header: "Collected", value: (d) => d.collected },
    ]);
  }

  function exportCampaignCsv() {
    downloadCsv(`finance-campaign-performance-${range.startDate}_to_${range.endDate}`, campaignPerf.data ?? [], [
      { header: "Campaign", value: (r: CampaignPerformance) => r.name },
      { header: "Spend", value: (r: CampaignPerformance) => r.spend },
      { header: "Leads", value: (r: CampaignPerformance) => r.leads },
      { header: "Revenue", value: (r: CampaignPerformance) => r.revenue },
      { header: "Profit", value: (r: CampaignPerformance) => r.profit },
      { header: "ROI %", value: (r: CampaignPerformance) => r.roi ?? "" },
    ]);
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Finance</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Cash-on-Home only — revenue is booking value, collected is cash actually received, outstanding is the gap.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddTxn((s) => !s)}>{showAddTxn ? "Cancel" : "+ Add Transaction"}</button>
      </div>

      <DateRangePicker onChange={(r) => setRange(r)} />

      {showAddTxn && <AddTransactionForm onSaved={() => { setShowAddTxn(false); refreshAll(); }} />}

      {report.loading && <LoadingState label="Loading finance data..." rows={3} />}
      {report.error && <ErrorState message={report.error} onRetry={report.retry} />}

      {report.data && (
        <>
          <div className="mh-dash-section">
            <p className="mh-dash-section__title">Overview — selected range</p>
            <div className="mh-metric-grid">
              <Metric icon="trending_up" label="Total Revenue" value={formatCurrencyInr(report.data.totalRevenue)} />
              <Metric icon="payments" label="Collected" value={formatCurrencyInr(report.data.totalCollected)} tone="success" />
              <Metric icon="hourglass_top" label="Pending Collection" value={formatCurrencyInr(report.data.outstanding)} tone={report.data.outstanding > 0 ? "warning" : "success"} />
              <Metric icon="local_shipping" label="Total TP" value={formatCurrencyInr(report.data.totalTp)} muted />
              <Metric icon="account_balance" label="Gross Margin" value={formatCurrencyInr(report.data.grossMargin)} tone={report.data.grossMargin >= 0 ? "success" : "danger"} />
              <Metric icon="request_quote" label="Expenses" value={formatCurrencyInr(report.data.totalExpenses)} tone="warning" />
              <Metric icon="savings" label="Net Profit" value={formatCurrencyInr(report.data.netProfit)} tone={report.data.netProfit >= 0 ? "success" : "danger"} />
              <Metric icon="undo" label="Refunds" value={formatCurrencyInr(report.data.refundedAmount)} muted={report.data.refundedAmount === 0} />
            </div>
            {report.data.tpUnknownCount > 0 && (
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                TP and Gross Margin may be understated — {report.data.tpUnknownCount} line item(s) in this range have no recorded TP yet
                ({report.data.tpKnownCount} known).
              </p>
            )}
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              Expenses = manually-entered expenses + campaign ad spend for this range. Net Profit = Gross Margin − Expenses + other income + adjustments.
            </p>
          </div>

          <div className="mh-dash-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="mh-dash-section__title">Trends</p>
              <button className="btn btn-outline" onClick={exportRevenueCsv} disabled={report.data.daily.length === 0}>
                <span className="mi" aria-hidden="true">download</span> Export CSV
              </button>
            </div>
            <div className="card">
              <div className="mh-chart-card__head">
                <span className="mi" aria-hidden="true">trending_up</span>
                <h3>Revenue vs Collected, by day</h3>
              </div>
              <TrendChart
                series={[
                  { label: "Revenue", color: "var(--color-primary)", data: report.data.daily.map((d) => ({ x: shortDayLabel(d.day), y: d.revenue })) },
                  { label: "Collected", color: "var(--color-success)", data: report.data.daily.map((d) => ({ x: shortDayLabel(d.day), y: d.collected })) },
                ]}
                valueFormatter={formatCurrencyInr}
              />
            </div>
          </div>

          <div className="mh-dash-section">
            <p className="mh-dash-section__title">Reports — where revenue and margin come from</p>
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div className="card">
                <div className="mh-chart-card__head"><span className="mi" aria-hidden="true">inventory_2</span><h3>Revenue by package</h3></div>
                <BarList items={report.data.byPackage.map((p) => ({ label: p.name, value: p.revenue }))} />
              </div>
              <div className="card">
                <div className="mh-chart-card__head"><span className="mi" aria-hidden="true">science</span><h3>Revenue by test</h3></div>
                <BarList items={report.data.byTest.map((t) => ({ label: t.name, value: t.revenue }))} />
              </div>
              <div className="card">
                <div className="mh-chart-card__head"><span className="mi" aria-hidden="true">groups</span><h3>Cash collected by staff</h3></div>
                <BarList items={report.data.cashByStaff.map((s) => ({ label: s.name, value: s.collected }))} />
              </div>
            </div>
          </div>

          <div className="mh-dash-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="mh-dash-section__title">Campaign performance — selected range</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" onClick={exportCampaignCsv} disabled={!campaignPerf.data?.length}>
                  <span className="mi" aria-hidden="true">download</span> Export CSV
                </button>
                <Link className="btn btn-outline" to="/admin/marketing/campaigns">Manage campaigns</Link>
              </div>
            </div>
            {campaignPerf.loading && <LoadingState rows={2} />}
            {campaignPerf.error && <ErrorState message={campaignPerf.error} onRetry={campaignPerf.retry} />}
            {campaignPerf.data && campaignPerf.data.every((c) => c.spend === 0) && (
              <EmptyState icon="campaign" title="No campaign spend logged in this range" description="Log spend from Marketing → Campaigns." />
            )}
            {campaignPerf.data && campaignPerf.data.some((c) => c.spend > 0) && (
              <BarList items={campaignPerf.data.filter((c) => c.spend > 0).map((c) => ({ label: c.name, value: c.spend }))} />
            )}
          </div>

          <div className="mh-dash-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="mh-dash-section__title">Transactions — selected range</p>
              <button className="btn btn-outline" onClick={exportTransactionsCsv} disabled={!transactions.data?.rows.length}>
                <span className="mi" aria-hidden="true">download</span> Export CSV
              </button>
            </div>
            {transactions.loading && <LoadingState rows={2} />}
            {transactions.error && <ErrorState message={transactions.error} onRetry={transactions.retry} />}
            {transactions.data && transactions.data.rows.length === 0 && (
              <EmptyState icon="receipt_long" title="No manual transactions in this range" description='Use "+ Add Transaction" to record income, expenses or an adjustment.' />
            )}
            {transactions.data && transactions.data.rows.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                {transactions.data.rows.map((t) => (
                  <div key={t.id} className="card" style={{ padding: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{t.category}</p>
                      <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                        {t.occurredOn} • {t.type}{t.description ? ` • ${t.description}` : ""}
                      </p>
                    </div>
                    <span style={{ fontWeight: 700, color: t.amount >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                      {t.amount >= 0 ? "+" : ""}{formatCurrencyInr(t.amount)}
                    </span>
                  </div>
                ))}
                {transactions.data.truncated && (
                  <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Showing the first 1,000 — narrow the date range for more precision.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mh-dash-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="mh-dash-section__title">Collection management — pending right now</p>
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Not date-filtered — every booking with cash still outstanding, regardless of range above.</p>
          </div>
          <button className="btn btn-outline" onClick={exportCollectionsCsv} disabled={!collections.data?.rows.length}>
            <span className="mi" aria-hidden="true">download</span> Export CSV
          </button>
        </div>
        {collections.loading && <LoadingState rows={3} />}
        {collections.error && <ErrorState message={collections.error} onRetry={collections.retry} />}
        {collections.data && collections.data.rows.length === 0 && <EmptyState icon="task_alt" title="Nothing outstanding" description="Every visible booking is fully collected." />}
        {collections.data && collections.data.rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="mh-table">
              <thead>
                <tr>
                  <th>Date</th><th>Customer</th><th>Amount</th><th>Received</th><th>Outstanding</th><th>Agent</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {collections.data.rows.map((r) => (
                  <tr key={r.bookingId}>
                    <td>{r.date}</td>
                    <td>{r.customerName}</td>
                    <td>{formatCurrencyInr(r.finalAmount)}</td>
                    <td>{formatCurrencyInr(r.amountReceived)}</td>
                    <td style={{ fontWeight: 700, color: "var(--color-amber)" }}>{formatCurrencyInr(r.outstanding)}</td>
                    <td>{r.assignedAgentName ?? "Unassigned"}</td>
                    <td><StatusBadge status={r.bookingStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {collections.data.truncated && (
              <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>Showing the first 500.</p>
            )}
            <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
              Record a payment from <Link to="/admin/bookings/dashboard">Booking Dashboard</Link> — search the booking there and use its own "Record" cash action.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<TransactionType, string> = { income: "Income", expense: "Expense", adjustment: "Adjustment" };

function categoriesFor(type: TransactionType): readonly string[] {
  if (type === "income") return INCOME_CATEGORIES;
  if (type === "expense") return EXPENSE_CATEGORIES;
  return ADJUSTMENT_CATEGORIES;
}

/**
 * Manual Finance Entry. Every field maps 1:1 to
 * record_financial_transaction()'s parameters — there is no direct
 * table write, so this form can't bypass the RPC's own validation
 * (amount sign, a reason required for adjustments) or skip the
 * audit_logs entry it always creates.
 */
function AddTransactionForm({ onSaved }: { onSaved: () => void }) {
  const { showToast } = useToast();
  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTypeChange(next: TransactionType) {
    setType(next);
    setCategory(categoriesFor(next)[0]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsed = Number.parseFloat(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Enter an amount greater than zero.");
      if (type === "adjustment" && !description.trim()) throw new Error("An adjustment needs a reason.");

      const input: RecordTransactionInput = {
        type,
        category,
        amount: type === "adjustment" && direction === "decrease" ? -parsed : parsed,
        occurredOn,
        description: description || undefined,
        reference: reference || undefined,
        paymentMethod: paymentMethod || undefined,
        notes: notes || undefined,
      };
      await recordFinancialTransaction(input);
      showToast(`${TYPE_LABELS[type]} recorded.`);
      onSaved();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
      <p style={{ fontWeight: 700 }}>Add transaction</p>
      <div style={{ display: "flex", gap: 8 }}>
        {(["income", "expense", "adjustment"] as const).map((t) => (
          <button key={t} type="button" className={type === t ? "btn btn-primary" : "btn btn-outline"} onClick={() => handleTypeChange(t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          {categoriesFor(type).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {type === "adjustment" && (
          <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} style={{ minWidth: 140 }}>
            <option value="decrease">Decrease (−)</option>
            <option value="increase">Increase (+)</option>
          </select>
        )}
        <input type="number" min="0.01" step="0.01" placeholder="Amount (₹)" required value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <input type="date" required value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} style={{ minWidth: 160 }} />
      </div>

      <input
        placeholder={type === "adjustment" ? "Reason for this adjustment (required)" : "Description (optional)"}
        required={type === "adjustment"}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <input placeholder="Reference (invoice / receipt no.)" value={reference} onChange={(e) => setReference(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
          <option value="">Payment method (optional)</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <textarea placeholder="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : `Save ${TYPE_LABELS[type].toLowerCase()}`}</button>
    </form>
  );
}

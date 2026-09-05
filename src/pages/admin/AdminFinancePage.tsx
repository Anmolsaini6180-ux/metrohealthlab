import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getFinanceSummary } from "@/services/adminFinanceService";
import { createCampaign, getAllCampaigns, updateCampaign } from "@/services/adminMarketingService";
import { formatCurrencyInr } from "@/services/pricingService";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import DateRangePicker from "@/components/admin/DateRangePicker";
import TrendChart from "@/components/admin/TrendChart";
import BarList from "@/components/admin/BarList";
import Metric from "@/components/admin/MetricCard";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

// Real Supabase data only — see adminFinanceService.ts's own header
// comment for exactly what is and isn't computed here, and why (no
// fabricated ROI figure; cost-per-lead/conversion are what the real
// schema actually supports).
export default function AdminFinancePage() {
  const [range, setRange] = useState<DateRange>(() => resolveDateRange("thisMonth"));
  const summary = useAsync(() => getFinanceSummary(range.startDate, range.endDate), [range.startDate, range.endDate]);

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Finance</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Revenue from real bookings, ad spend and leads from Marketing — scoped to the selected date range.
          </p>
        </div>
      </div>

      <DateRangePicker onChange={(r) => setRange(r)} />

      <SpendEntry range={range} onSaved={summary.retry} />

      {summary.loading && <LoadingState label="Loading finance data..." rows={3} />}
      {summary.error && <ErrorState message={summary.error} onRetry={summary.retry} />}

      {summary.data && (
        <>
          {summary.data.revenueMayBeIncomplete && (
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              This range has more bookings than can be loaded at once — revenue below is a real sum of what was
              fetched, but may undercount a very large range.
            </p>
          )}

          <div className="mh-dash-section">
            <p className="mh-dash-section__title">Revenue &amp; Marketing — selected range</p>
            <div className="mh-metric-grid">
              <Metric icon="payments" label="Revenue (cash collected)" value={formatCurrencyInr(summary.data.revenue)} tone="success" />
              <Metric icon="campaign" label="Ad spend" value={formatCurrencyInr(summary.data.adSpend)} tone="warning" />
              <Metric
                icon="account_balance"
                label="Net (revenue − ad spend)"
                value={formatCurrencyInr(summary.data.revenue - summary.data.adSpend)}
                tone={summary.data.revenue - summary.data.adSpend >= 0 ? "success" : "danger"}
              />
              <Metric icon="calendar_month" label="Bookings" value={summary.data.bookingsCount} />
              <Metric icon="person_search" label="Leads" value={summary.data.leadsCount} />
              <Metric icon="how_to_reg" label="Converted" value={summary.data.convertedCount} tone="success" />
              <Metric
                icon="request_quote"
                label="Cost per lead"
                value={summary.data.costPerLead !== null ? formatCurrencyInr(summary.data.costPerLead) : "—"}
                muted={summary.data.costPerLead === null}
              />
              <Metric
                icon="military_tech"
                label="Cost per conversion"
                value={summary.data.costPerConversion !== null ? formatCurrencyInr(summary.data.costPerConversion) : "—"}
                muted={summary.data.costPerConversion === null}
              />
            </div>
            <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
              "Net" is total revenue minus total ad spend for this same period — a straight subtraction, not a claim
              that this spend produced this revenue (this schema has no link from a booking back to the lead/ad that
              produced it).
            </p>
            {summary.data.adSpend === 0 && (
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                No ad spend recorded for this range yet — log it above, or on a campaign in{" "}
                <Link to="/admin/marketing/campaigns">Marketing → Campaigns</Link>.
              </p>
            )}
          </div>

          <div className="mh-dash-section">
            <p className="mh-dash-section__title">Trends</p>
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <div className="card">
                <div className="mh-chart-card__head">
                  <span className="mi" aria-hidden="true">trending_up</span>
                  <h3>Revenue by day</h3>
                </div>
                <TrendChart series={[{ label: "Revenue", color: "var(--color-success)", data: summary.data.revenueByDay }]} valueFormatter={formatCurrencyInr} />
              </div>
              <div className="card">
                <div className="mh-chart-card__head">
                  <span className="mi" aria-hidden="true">person_search</span>
                  <h3>Leads by day</h3>
                </div>
                <TrendChart series={[{ label: "Leads", color: "var(--color-primary)", data: summary.data.leadsByDay }]} />
              </div>
            </div>
          </div>

          <div className="mh-dash-section">
            <p className="mh-dash-section__title">Where spend and leads are going</p>
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div className="card">
                <div className="mh-chart-card__head">
                  <span className="mi" aria-hidden="true">campaign</span>
                  <h3>Ad spend by campaign</h3>
                </div>
                <BarList items={summary.data.spendByCampaign.map((c) => ({ label: c.label, value: c.value }))} />
              </div>
              <div className="card">
                <div className="mh-chart-card__head">
                  <span className="mi" aria-hidden="true">insights</span>
                  <h3>Leads by campaign</h3>
                </div>
                <BarList items={summary.data.leadsByCampaign} />
              </div>
              <div className="card">
                <div className="mh-chart-card__head">
                  <span className="mi" aria-hidden="true">share</span>
                  <h3>Leads by source</h3>
                </div>
                <BarList items={summary.data.leadsBySource} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The one thing this page was missing entirely: a way to actually
 * enter the ad-spend figure everything above is computed from.
 * campaigns.spend already existed as a real column — this is the first
 * UI that writes to it directly on Finance itself, rather than only
 * through Marketing -> Campaigns -> Edit, which most people looking at
 * a Finance dashboard would never think to go find.
 */
function SpendEntry({ range, onSaved }: { range: DateRange; onSaved: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const campaigns = useAsync(getAllCampaigns, []);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [campaignId, setCampaignId] = useState("");
  const [newName, setNewName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = Number.parseFloat(amount);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Enter a valid spend amount.");

      if (mode === "existing") {
        if (!campaignId) throw new Error("Choose a campaign first.");
        await updateCampaign(user.uid, campaignId, { spend: parsed });
      } else {
        if (!newName.trim()) throw new Error("Name the campaign first.");
        // A minimal real campaign, dated to the range currently being
        // viewed so it immediately counts toward it — every other
        // field (type, exact dates, linked offer/coupon) can be
        // refined later in Marketing -> Campaigns; nothing here is a
        // placeholder value pretending to be a real setting.
        await createCampaign(user.uid, {
          name: newName.trim(),
          type: "general",
          startAt: range.startDate,
          endAt: range.endDate,
          status: "RUNNING",
          spend: parsed,
        });
      }
      setAmount("");
      setNewName("");
      setCampaignId("");
      showToast("Spend saved.");
      campaigns.retry();
      onSaved();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: "var(--space-sm)" }}>
      <p style={{ fontWeight: 600 }}>Log ad spend</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={mode === "existing" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setMode("existing")}>
          Existing campaign
        </button>
        <button type="button" className={mode === "new" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setMode("new")}>
          New campaign
        </button>
      </div>

      {mode === "existing" ? (
        campaigns.data && campaigns.data.length > 0 ? (
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Choose a campaign...</option>
            {campaigns.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — current: {formatCurrencyInr(c.spend)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            {campaigns.loading ? "Loading campaigns..." : "No campaigns yet — use “New campaign” instead."}
          </p>
        )
      ) : (
        <input placeholder="Campaign name (e.g. Instagram boost, Sept)" value={newName} onChange={(e) => setNewName(e.target.value)} />
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount spent (₹)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button className="btn btn-primary" type="button" disabled={busy} onClick={handleSave}>
          {busy ? "Saving..." : "Save spend"}
        </button>
      </div>
      {mode === "new" && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          Creates a real campaign dated {range.startDate} to {range.endDate} (edit its type/dates/details anytime in
          Marketing → Campaigns).
        </p>
      )}
      {mode === "existing" && campaigns.error && <ErrorState message={campaigns.error} onRetry={campaigns.retry} />}
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
    </div>
  );
}

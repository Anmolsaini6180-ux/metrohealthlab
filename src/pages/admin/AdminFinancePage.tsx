import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { getFinanceSummary } from "@/services/adminFinanceService";
import { formatCurrencyInr } from "@/services/pricingService";
import { resolveDateRange, type DateRange } from "@/utils/dateRanges";
import DateRangePicker from "@/components/admin/DateRangePicker";
import TrendChart from "@/components/admin/TrendChart";
import BarList from "@/components/admin/BarList";
import Metric from "@/components/admin/MetricCard";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";

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
            {summary.data.adSpend === 0 && (
              <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                No ad spend recorded for this range yet — add it on a campaign in{" "}
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

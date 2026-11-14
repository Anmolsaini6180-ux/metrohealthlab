import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { createCampaign, getAllCampaigns, getCampaignPerformance, updateCampaign } from "@/services/adminMarketingService";
import { getAllOffers, getAllCoupons } from "@/services/adminCatalogService";
import { formatCurrencyInr } from "@/services/pricingService";
import { downloadCsv } from "@/utils/csvExport";
import { CAMPAIGN_TYPES, GENDER_TARGETS, type Campaign, type CampaignStatus } from "@/types/marketing";
import type { CampaignPerformance } from "@/types/finance";
import Metric from "@/components/admin/MetricCard";
import StatusBadge from "@/components/admin/StatusBadge";
import ImagePicker from "@/components/admin/ImagePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminCampaignsPage() {
  const { user } = useAuth();
  const campaigns = useAsync(getAllCampaigns, []);
  const performance = useAsync(() => getCampaignPerformance(), []);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  const perfById = useMemo(() => new Map((performance.data ?? []).map((p) => [p.id, p])), [performance.data]);

  async function handleStatusChange(campaign: Campaign, status: CampaignStatus) {
    if (!user) return;
    await updateCampaign(user.uid, campaign.id, { status });
    campaigns.retry();
  }

  function refreshAll() {
    campaigns.retry();
    performance.retry();
  }

  function exportCsv() {
    downloadCsv("campaign-performance", performance.data ?? [], [
      { header: "Campaign", value: (r: CampaignPerformance) => r.name },
      { header: "Status", value: (r: CampaignPerformance) => r.status },
      { header: "Spend", value: (r: CampaignPerformance) => r.spend },
      { header: "Leads", value: (r: CampaignPerformance) => r.leads },
      { header: "Converted", value: (r: CampaignPerformance) => r.converted },
      { header: "Bookings", value: (r: CampaignPerformance) => r.bookings },
      { header: "Revenue", value: (r: CampaignPerformance) => r.revenue },
      { header: "Gross Margin", value: (r: CampaignPerformance) => r.grossMargin },
      { header: "Profit", value: (r: CampaignPerformance) => r.profit },
      { header: "ROI %", value: (r: CampaignPerformance) => r.roi ?? "" },
      { header: "Conversion Rate %", value: (r: CampaignPerformance) => r.conversionRate ?? "" },
      { header: "Cost per Lead", value: (r: CampaignPerformance) => r.costPerLead ?? "" },
      { header: "Cost per Booking", value: (r: CampaignPerformance) => r.costPerBooking ?? "" },
    ]);
  }

  const totals = useMemo(() => {
    const list = campaigns.data ?? [];
    const perf = performance.data ?? [];
    const totalSpend = perf.reduce((sum, p) => sum + p.spend, 0);
    const totalRevenue = perf.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = perf.reduce((sum, p) => sum + p.profit, 0);
    return {
      total: list.length,
      active: list.filter((c) => c.status === "RUNNING").length,
      scheduled: list.filter((c) => c.status === "SCHEDULED").length,
      completed: list.filter((c) => c.status === "COMPLETED").length,
      totalLeads: perf.reduce((sum, p) => sum + p.leads, 0),
      convertedLeads: perf.reduce((sum, p) => sum + p.converted, 0),
      totalSpend,
      totalRevenue,
      // Aggregate ROI across every campaign, not an average of each
      // campaign's own ROI% (which would over-weight small-spend
      // campaigns) — same null-when-zero-spend safety as the per-campaign figure.
      roi: totalSpend > 0 ? Math.round((totalProfit / totalSpend) * 10000) / 100 : null,
    };
  }, [campaigns.data, performance.data]);

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="mh-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Campaigns</h1>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            Real spend, leads and attributed bookings — not a data-entry log.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={exportCsv} disabled={!performance.data?.length}>
            <span className="mi" aria-hidden="true">download</span> Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ Add campaign"}</button>
        </div>
      </div>

      <div className="mh-metric-grid">
        <Metric icon="campaign" label="Total Campaigns" value={totals.total} />
        <Metric icon="bolt" label="Active" value={totals.active} tone="success" />
        <Metric icon="schedule" label="Scheduled" value={totals.scheduled} />
        <Metric icon="task_alt" label="Completed" value={totals.completed} tone="accent" />
        <Metric icon="person_search" label="Total Leads" value={totals.totalLeads} />
        <Metric icon="how_to_reg" label="Converted Leads" value={totals.convertedLeads} tone="success" />
        <Metric icon="payments" label="Campaign Spend" value={formatCurrencyInr(totals.totalSpend)} tone="warning" />
        <Metric icon="trending_up" label="Revenue Generated" value={formatCurrencyInr(totals.totalRevenue)} tone="success" />
        <Metric icon="insights" label="ROI" value={totals.roi !== null ? `${totals.roi}%` : "—"} muted={totals.roi === null} tone={totals.roi !== null && totals.roi >= 0 ? "success" : totals.roi !== null ? "danger" : undefined} />
      </div>
      {totals.totalSpend === 0 && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          Revenue and ROI above only ever count leads explicitly linked to a real booking (see each lead's "Link to
          booking") — they will read ₹0 / — until spend is logged and at least one lead is converted and linked.
        </p>
      )}

      {showCreate && user && (
        <CampaignForm actorUid={user.uid} onDone={() => { setShowCreate(false); refreshAll(); }} />
      )}
      {editing && user && (
        <CampaignForm actorUid={user.uid} existing={editing} onDone={() => { setEditing(null); refreshAll(); }} />
      )}

      {campaigns.loading && <LoadingState rows={3} />}
      {campaigns.error && <ErrorState message={campaigns.error} onRetry={campaigns.retry} />}
      {campaigns.data && campaigns.data.length === 0 && <EmptyState icon="campaign" title="No campaigns yet" />}
      {campaigns.data && campaigns.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {campaigns.data.map((c) => {
            const perf = perfById.get(c.id);
            return (
              <div key={c.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600 }}>{c.name}</p>
                    <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{c.type} • {c.startAt} → {c.endAt}</p>
                    {(c.area || c.targetOffering) && (
                      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
                        {[c.area, c.targetOffering].filter(Boolean).join(" • ")}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                <div className="mh-metric-grid" style={{ marginTop: "var(--space-sm)", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
                  <MiniStat label="Spend" value={formatCurrencyInr(c.spend)} />
                  <MiniStat label="Leads" value={perf?.leads ?? 0} />
                  <MiniStat label="Converted" value={perf?.converted ?? 0} />
                  <MiniStat label="Bookings" value={perf?.bookings ?? 0} />
                  <MiniStat label="Revenue" value={formatCurrencyInr(perf?.revenue ?? 0)} />
                  <MiniStat label="Profit" value={formatCurrencyInr(perf?.profit ?? 0)} tone={(perf?.profit ?? 0) >= 0 ? "success" : "danger"} />
                  <MiniStat label="ROI" value={perf?.roi != null ? `${perf.roi}%` : "—"} muted={perf?.roi == null} />
                  <MiniStat label="Cost / lead" value={perf?.costPerLead != null ? formatCurrencyInr(perf.costPerLead) : "—"} muted={perf?.costPerLead == null} />
                </div>
                {perf && perf.tpUnknown > 0 && (
                  <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                    Margin may be understated — {perf.tpUnknown} attributed line item(s) have no recorded TP yet.
                  </p>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
                  <button className="btn btn-outline" onClick={() => setEditing(c)}>Edit</button>
                  <Link className="btn btn-outline" to={`/admin/marketing/leads?campaignId=${c.id}`}>
                    <span className="mi" aria-hidden="true">person_search</span> View leads
                  </Link>
                  {c.status === "DRAFT" && (
                    <button className="btn btn-outline" onClick={() => handleStatusChange(c, "SCHEDULED")}>Schedule</button>
                  )}
                  {c.status !== "RUNNING" && c.status !== "COMPLETED" && (
                    <button className="btn btn-outline" onClick={() => handleStatusChange(c, "RUNNING")}>Resume / Start</button>
                  )}
                  {c.status === "RUNNING" && (
                    <button className="btn btn-outline" onClick={() => handleStatusChange(c, "PAUSED")}>Pause</button>
                  )}
                  {c.status !== "COMPLETED" && (
                    <button className="btn btn-outline" onClick={() => handleStatusChange(c, "COMPLETED")}>Archive (Complete)</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {performance.error && <ErrorState message={performance.error} onRetry={performance.retry} />}
    </div>
  );
}

function MiniStat({ label, value, tone, muted }: { label: string; value: string | number; tone?: "success" | "danger"; muted?: boolean }) {
  return (
    <div style={{ padding: "6px 8px", background: "var(--color-bg-tint)", borderRadius: "var(--radius-sm)" }}>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-soft)" }}>{label}</p>
      <p style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: muted ? "var(--color-text-soft)" : tone ? `var(--color-${tone})` : undefined }}>
        {value}
      </p>
    </div>
  );
}

function CampaignForm({
  actorUid,
  existing,
  onDone,
}: {
  actorUid: string;
  existing?: Campaign;
  onDone: () => void;
}) {
  const offers = useAsync(getAllOffers, []);
  const coupons = useAsync(getAllCoupons, []);
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    type: existing?.type ?? CAMPAIGN_TYPES[0],
    status: existing?.status ?? "DRAFT",
    startAt: existing?.startAt ?? "",
    endAt: existing?.endAt ?? "",
    offerId: existing?.offerId ?? "",
    couponId: existing?.couponId ?? "",
    area: existing?.area ?? "",
    ageGroup: existing?.ageGroup ?? "",
    gender: existing?.gender ?? "All",
    targetOffering: existing?.targetOffering ?? "",
    targetSegment: existing?.targetSegment ?? "",
    plannedBudget: existing?.plannedBudget != null ? String(existing.plannedBudget) : "",
    dailyBudget: existing?.dailyBudget != null ? String(existing.dailyBudget) : "",
    spend: existing ? String(existing.spend) : "0",
    whatsappMessage: existing?.whatsappMessage ?? "",
    ctaText: existing?.ctaText ?? "",
    ctaLink: existing?.ctaLink ?? "",
    landingPage: existing?.landingPage ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const plannedBudgetNum = Number.parseFloat(form.plannedBudget);
  const spendNum = Number.parseFloat(form.spend);
  const remainingBudget = Number.isFinite(plannedBudgetNum) && Number.isFinite(spendNum) ? plannedBudgetNum - spendNum : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsedSpend = Number.parseFloat(form.spend);
      const payload = {
        name: form.name,
        description: form.description,
        type: form.type,
        status: form.status as Campaign["status"],
        startAt: form.startAt,
        endAt: form.endAt,
        offerId: form.offerId,
        couponId: form.couponId,
        area: form.area,
        ageGroup: form.ageGroup,
        gender: form.gender,
        targetOffering: form.targetOffering,
        targetSegment: form.targetSegment,
        plannedBudget: form.plannedBudget.trim() === "" ? null : Number.parseFloat(form.plannedBudget),
        dailyBudget: form.dailyBudget.trim() === "" ? null : Number.parseFloat(form.dailyBudget),
        spend: Number.isFinite(parsedSpend) && parsedSpend >= 0 ? parsedSpend : 0,
        whatsappMessage: form.whatsappMessage,
        ctaText: form.ctaText,
        ctaLink: form.ctaLink,
        landingPage: form.landingPage,
      };
      if (existing) {
        await updateCampaign(actorUid, existing.id, payload);
      } else {
        await createCampaign(actorUid, payload);
      }
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
      <FormSection title="Basic">
        <input placeholder="Campaign name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
        <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <select value={form.type} onChange={(e) => update("type", e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.status} onChange={(e) => update("status", e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            {(["DRAFT", "SCHEDULED", "RUNNING", "PAUSED", "COMPLETED"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <label style={{ flex: 1, fontSize: "var(--text-xs)" }}>
            Start date
            <input type="date" required value={form.startAt} onChange={(e) => update("startAt", e.target.value)} />
          </label>
          <label style={{ flex: 1, fontSize: "var(--text-xs)" }}>
            End date
            <input type="date" required value={form.endAt} onChange={(e) => update("endAt", e.target.value)} />
          </label>
        </div>
      </FormSection>

      <FormSection title="Targeting">
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <input placeholder="Area / City" value={form.area} onChange={(e) => update("area", e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <input placeholder="Age group (e.g. 25-40)" value={form.ageGroup} onChange={(e) => update("ageGroup", e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <select value={form.gender} onChange={(e) => update("gender", e.target.value)} style={{ flex: 1, minWidth: 120 }}>
            {GENDER_TARGETS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <input placeholder="Target service / package / test (e.g. Full Body Checkup)" value={form.targetOffering} onChange={(e) => update("targetOffering", e.target.value)} />
        <input placeholder="Target audience (e.g. existing customers, 3rd checkup reminder)" value={form.targetSegment} onChange={(e) => update("targetSegment", e.target.value)} />
      </FormSection>

      <FormSection title="Budget">
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <label style={{ flex: 1, minWidth: 120, fontSize: "var(--text-xs)" }}>
            Planned budget (₹)
            <input type="number" min="0" step="0.01" value={form.plannedBudget} onChange={(e) => update("plannedBudget", e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 120, fontSize: "var(--text-xs)" }}>
            Daily budget (₹)
            <input type="number" min="0" step="0.01" value={form.dailyBudget} onChange={(e) => update("dailyBudget", e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 120, fontSize: "var(--text-xs)" }}>
            Actual spend so far (₹)
            <input type="number" min="0" step="0.01" value={form.spend} onChange={(e) => update("spend", e.target.value)} />
          </label>
        </div>
        {remainingBudget !== null && (
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Remaining budget: {formatCurrencyInr(remainingBudget)}{remainingBudget < 0 ? " (over budget)" : ""}
          </p>
        )}
      </FormSection>

      <FormSection title="Creative">
        {existing ? (
          <ImagePicker
            label="Campaign image / banner"
            category="campaigns"
            relatedId={existing.id}
            hint="Shown wherever this campaign's creative is referenced internally."
          />
        ) : (
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>Save the campaign first to attach a creative image.</p>
        )}
        <textarea placeholder="WhatsApp message" rows={2} value={form.whatsappMessage} onChange={(e) => update("whatsappMessage", e.target.value)} />
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <input placeholder="CTA text (e.g. Book Now)" value={form.ctaText} onChange={(e) => update("ctaText", e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <input placeholder="CTA link (e.g. /packages/full-body-checkup)" value={form.ctaLink} onChange={(e) => update("ctaLink", e.target.value)} style={{ flex: 2, minWidth: 200 }} />
        </div>
        <input placeholder="Landing page URL (optional, if different from CTA link)" value={form.landingPage} onChange={(e) => update("landingPage", e.target.value)} />
      </FormSection>

      <FormSection title="Linked offer / coupon (optional)">
        <select value={form.offerId} onChange={(e) => update("offerId", e.target.value)}>
          <option value="">Link an offer (optional)</option>
          {(offers.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <select value={form.couponId} onChange={(e) => update("couponId", e.target.value)}>
          <option value="">Link a coupon (optional)</option>
          {(coupons.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
      </FormSection>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : existing ? "Save changes" : "Create campaign"}</button>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{title}</p>
      {children}
    </div>
  );
}

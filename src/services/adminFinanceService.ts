// Supabase-backed. Every figure here is derived from real rows the
// caller's own RLS visibility allows (bookings_select's hierarchy
// scoping, campaigns/leads' can_view_analytics() read policy — see the
// add_finance_ad_spend_and_analytics_read_access migration) — nothing
// here is estimated, and no metric is computed unless the schema
// genuinely supports it (no fabricated ROI figure that would imply
// causal ad-attribution the data doesn't carry — see costPerLead's own
// comment below).
import { getAdminBookings } from "./adminBookingService";
import { getSupabaseClient } from "@/supabase/client";
import { enumerateDays } from "@/utils/dateRanges";

export interface FinanceRankedItem {
  label: string;
  value: number;
}

export interface FinanceSummary {
  startDate: string;
  endDate: string;
  /** Cash actually collected on bookings in range (Cash on Home only — same figure AdminDashboardPage's own "Cash collected" stat uses). */
  revenue: number;
  /** True if the range has more bookings than getAdminBookings' own cap — revenue is a real sum of what was fetched, not a guess, but may undercount a very large range. */
  revenueMayBeIncomplete: boolean;
  bookingsCount: number;
  /** Sum of campaigns.spend for every campaign whose own date range overlaps the selected range. Real admin-entered figures — 0 until an admin sets one. */
  adSpend: number;
  leadsCount: number;
  convertedCount: number;
  /**
   * adSpend / leadsCount. Deliberately NOT a "ROI" or "revenue per rupee
   * spent" figure — this schema has no link from a booking back to the
   * lead/campaign that produced it, so treating `revenue` as ad-
   * attributed would overstate what the data actually shows. Cost per
   * lead and cost per conversion are the honest metrics this data
   * genuinely supports.
   */
  costPerLead: number | null;
  costPerConversion: number | null;
  revenueByDay: { x: string; y: number }[];
  leadsByDay: { x: string; y: number }[];
  spendByCampaign: FinanceRankedItem[];
  leadsByCampaign: FinanceRankedItem[];
  leadsBySource: FinanceRankedItem[];
}

function shortDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export async function getFinanceSummary(startDate: string, endDate: string): Promise<FinanceSummary> {
  const client = getSupabaseClient();

  const [bookingsResult, leadsResult, campaignsResult] = await Promise.all([
    getAdminBookings({ startDate, endDate }),
    client
      .from("leads")
      .select("created_at, status, campaign_id, source")
      .gte("created_at", startDate)
      .lte("created_at", `${endDate}T23:59:59.999Z`),
    client.from("campaigns").select("id, name, spend").lte("start_at", endDate).gte("end_at", startDate),
  ]);

  if (leadsResult.error) throw leadsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;

  const days = enumerateDays(startDate, endDate);
  const revenueByDayMap = new Map<string, number>();
  let revenue = 0;
  for (const b of bookingsResult.bookings) {
    const amount = b.amountReceived ?? 0;
    revenue += amount;
    revenueByDayMap.set(b.date, (revenueByDayMap.get(b.date) ?? 0) + amount);
  }

  const leadRows = leadsResult.data ?? [];
  const leadsByDayMap = new Map<string, number>();
  const leadsByCampaignMap = new Map<string, number>();
  const leadsBySourceMap = new Map<string, number>();
  let convertedCount = 0;
  for (const l of leadRows) {
    const day = String(l.created_at).slice(0, 10);
    leadsByDayMap.set(day, (leadsByDayMap.get(day) ?? 0) + 1);
    if (l.campaign_id) leadsByCampaignMap.set(l.campaign_id as string, (leadsByCampaignMap.get(l.campaign_id as string) ?? 0) + 1);
    const source = (l.source as string | null)?.trim() || "Unknown";
    leadsBySourceMap.set(source, (leadsBySourceMap.get(source) ?? 0) + 1);
    if (l.status === "CONVERTED") convertedCount += 1;
  }

  const campaignRows = campaignsResult.data ?? [];
  let adSpend = 0;
  const spendByCampaign: FinanceRankedItem[] = [];
  const campaignNameById = new Map<string, string>();
  for (const c of campaignRows) {
    const spend = Number(c.spend ?? 0);
    adSpend += spend;
    campaignNameById.set(c.id as string, c.name as string);
    if (spend > 0) spendByCampaign.push({ label: c.name as string, value: spend });
  }

  const leadsByCampaign: FinanceRankedItem[] = [...leadsByCampaignMap.entries()].map(([id, count]) => ({
    label: campaignNameById.get(id) ?? "Unlinked campaign",
    value: count,
  }));

  return {
    startDate,
    endDate,
    revenue,
    revenueMayBeIncomplete: bookingsResult.truncated,
    bookingsCount: bookingsResult.bookings.length,
    adSpend,
    leadsCount: leadRows.length,
    convertedCount,
    costPerLead: leadRows.length > 0 ? adSpend / leadRows.length : null,
    costPerConversion: convertedCount > 0 ? adSpend / convertedCount : null,
    revenueByDay: days.map((d) => ({ x: shortDayLabel(d), y: revenueByDayMap.get(d) ?? 0 })),
    leadsByDay: days.map((d) => ({ x: shortDayLabel(d), y: leadsByDayMap.get(d) ?? 0 })),
    spendByCampaign: spendByCampaign.sort((a, b) => b.value - a.value),
    leadsByCampaign: leadsByCampaign.sort((a, b) => b.value - a.value),
    leadsBySource: [...leadsBySourceMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
  };
}

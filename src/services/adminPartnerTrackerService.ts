// Supabase-backed, SUPER_ADMIN only. Access is enforced by RLS on the
// tracker tables and by partner_tracker_bookings() itself (see
// supabase/partner_tracker.sql) — hiding the menu item is only UX.
// Writes are audited server-side by triggers, not by this file.
import { getSupabaseClient } from "@/supabase/client";
import type {
  AdSpendEntry,
  BookingFinanceInput,
  HealthiansSettlement,
  PartnerPayout,
  ReceivedAt,
  TrackerBooking,
  TrackerPartner,
} from "@/types/partnerTracker";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0);
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

function rowToBooking(r: Row): TrackerBooking {
  return {
    bookingId: str(r.booking_id),
    reference: str(r.reference),
    date: str(r.booking_date),
    startAt: r.start_at ? str(r.start_at) : undefined,
    bookingStatus: str(r.booking_status),
    source: str(r.source),
    patientName: str(r.patient_name),
    phone: str(r.phone),
    city: str(r.city),
    address: str(r.address),
    items: str(r.items),
    billed: num(r.billed),
    amountReceived: num(r.amount_received),
    itemsTp: numOrNull(r.items_tp),
    partnerId: r.partner_id ? str(r.partner_id) : null,
    isTp: r.is_tp === true,
    tpAmount: numOrNull(r.tp_amount),
    partnerPayment: num(r.partner_payment),
    labCost: numOrNull(r.lab_cost),
    receivedAt: (r.received_at as ReceivedAt | null) ?? null,
    notes: str(r.notes),
  };
}

function rowToPartner(r: Row): TrackerPartner {
  return {
    id: str(r.id),
    name: str(r.name),
    phone: r.phone ? str(r.phone) : undefined,
    commissionRate: num(r.commission_rate),
    active: r.active !== false,
  };
}

// ------------------------------------------------------------- bookings
/** Every real booking (all time) with its tracker facts. The page filters by date client-side because partner balances must be all-time. */
export async function getTrackerBookings(): Promise<TrackerBooking[]> {
  const { data, error } = await getSupabaseClient().rpc("partner_tracker_bookings", { p_start: null, p_end: null });
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map(rowToBooking);
}

export async function saveBookingFinance(bookingId: string, input: BookingFinanceInput): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("booking_finance")
    .upsert(
      {
        booking_id: bookingId,
        partner_id: input.partnerId,
        is_tp: input.isTp,
        tp_amount: input.isTp ? input.tpAmount : null,
        partner_payment: input.partnerPayment,
        lab_cost: input.isTp ? null : input.labCost,
        received_at: input.receivedAt,
        notes: input.notes.trim() || null,
      },
      { onConflict: "booking_id" }
    );
  if (error) throw error;
}

// ------------------------------------------------------------- partners
export async function getPartners(): Promise<TrackerPartner[]> {
  const { data, error } = await getSupabaseClient().from("tracker_partners").select("*").order("name");
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map(rowToPartner);
}

export async function addPartner(input: { name: string; phone?: string; commissionRate: number }): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("tracker_partners")
    .insert({ name: input.name.trim(), phone: input.phone?.trim() || null, commission_rate: input.commissionRate });
  if (error) throw error;
}

export async function updatePartner(id: string, patch: { commissionRate?: number; active?: boolean; phone?: string }): Promise<void> {
  const update: Row = {};
  if (patch.commissionRate !== undefined) update.commission_rate = patch.commissionRate;
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.phone !== undefined) update.phone = patch.phone.trim() || null;
  const { error } = await getSupabaseClient().from("tracker_partners").update(update).eq("id", id);
  if (error) throw error;
}

// -------------------------------------------------------------- payouts
export async function getPayouts(): Promise<PartnerPayout[]> {
  const { data, error } = await getSupabaseClient().from("partner_payouts").select("*").order("paid_on", { ascending: false });
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: str(r.id), partnerId: str(r.partner_id), paidOn: str(r.paid_on), amount: num(r.amount), reference: str(r.reference),
  }));
}

export async function addPayout(input: { partnerId: string; paidOn: string; amount: number; reference?: string }): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("partner_payouts")
    .insert({ partner_id: input.partnerId, paid_on: input.paidOn, amount: input.amount, reference: input.reference?.trim() || null });
  if (error) throw error;
}

export async function deletePayout(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("partner_payouts").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------- healthians
export async function getSettlements(): Promise<HealthiansSettlement[]> {
  const { data, error } = await getSupabaseClient().from("healthians_settlements").select("*").order("settled_on", { ascending: false });
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: str(r.id), direction: r.direction === "out" ? "out" : "in", settledOn: str(r.settled_on), amount: num(r.amount), reference: str(r.reference),
  }));
}

export async function addSettlement(input: { direction: "in" | "out"; settledOn: string; amount: number; reference?: string }): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("healthians_settlements")
    .insert({ direction: input.direction, settled_on: input.settledOn, amount: input.amount, reference: input.reference?.trim() || null });
  if (error) throw error;
}

export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("healthians_settlements").delete().eq("id", id);
  if (error) throw error;
}

// --------------------------------------------------------------- ad spend
export async function getAdSpend(): Promise<AdSpendEntry[]> {
  const { data, error } = await getSupabaseClient().from("ad_spend_entries").select("*").order("spent_on", { ascending: false });
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: str(r.id), spentOn: str(r.spent_on), campaign: str(r.campaign), amount: num(r.amount), leads: num(r.leads),
  }));
}

export async function addAdSpend(input: { spentOn: string; campaign?: string; amount: number; leads?: number }): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("ad_spend_entries")
    .insert({ spent_on: input.spentOn, campaign: input.campaign?.trim() || null, amount: input.amount, leads: input.leads ?? 0 });
  if (error) throw error;
}

export async function deleteAdSpend(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("ad_spend_entries").delete().eq("id", id);
  if (error) throw error;
}

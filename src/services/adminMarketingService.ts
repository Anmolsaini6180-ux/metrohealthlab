// Supabase-backed. Campaigns/leads are direct table CRUD gated by RLS
// (campaigns_all_staff / leads_all_staff = can_manage_catalog(), i.e.
// SUPER_ADMIN/ADMIN) -- the same boundary shape the Firestore rules
// used. Segments are computed from real booking/profile rows the
// caller can actually see, rather than a Cloud Function that was never
// deployed.
import { getSupabaseClient } from "@/supabase/client";
import { rowToCampaign, rowToLead } from "@/supabase/mappers";
import type { Campaign, CampaignStatus, Lead, LeadStatus } from "@/types/marketing";

// Segments are computed, not stored documents.
export interface CustomerSegmentsResult {
  segments: { key: string; label: string; criteria: string; count: number }[];
  sampledBookings: number;
  approximate: boolean;
}

// null/undefined -> null; a blank string also clears the field -> null
// (same convention the Firestore version used via optionalText(), just
// landing on a real SQL NULL instead of an omitted key).
function optional<T>(value: T | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return (trimmed === "" ? null : trimmed) as T | null;
  }
  return value;
}

// created_by is a uuid FK to profiles(id) -- the live Supabase session's
// own id, not the Firebase-shaped actorUid this file otherwise carries
// purely for updated_by_firebase_uid provenance.
async function currentSupabaseUserId(): Promise<string | null> {
  const { data } = await getSupabaseClient().auth.getUser();
  return data.user?.id ?? null;
}

// ---------- Campaigns ----------

export async function getAllCampaigns(): Promise<Campaign[]> {
  const { data, error } = await getSupabaseClient().from("campaigns").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCampaign);
}

export interface CampaignInput {
  name: string;
  type: string;
  startAt: string;
  endAt: string;
  status: CampaignStatus;
  description?: string | null;
  offerId?: string | null;
  couponId?: string | null;
  targetSegment?: string | null;
}

export async function createCampaign(actorUid: string, input: CampaignInput): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("campaigns")
    .insert({
      // Same real bug as adminCatalogService.ts's create* functions:
      // campaigns.id is `text not null` with no default — never set
      // here, so this always 23502'd. Fixed the same way.
      id: crypto.randomUUID(),
      name: input.name.trim(),
      type: input.type.trim(),
      start_at: input.startAt,
      end_at: input.endAt,
      status: input.status,
      description: optional(input.description),
      offer_id: optional(input.offerId),
      coupon_id: optional(input.couponId),
      target_segment: optional(input.targetSegment),
      created_by: await currentSupabaseUserId(),
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateCampaign(actorUid: string, campaignId: string, input: Partial<CampaignInput>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.type !== undefined) patch.type = input.type.trim();
  if (input.startAt !== undefined) patch.start_at = input.startAt;
  if (input.endAt !== undefined) patch.end_at = input.endAt;
  if (input.status !== undefined) patch.status = input.status;
  if (input.description !== undefined) patch.description = optional(input.description);
  if (input.offerId !== undefined) patch.offer_id = optional(input.offerId);
  if (input.couponId !== undefined) patch.coupon_id = optional(input.couponId);
  if (input.targetSegment !== undefined) patch.target_segment = optional(input.targetSegment);

  const { error } = await getSupabaseClient().from("campaigns").update(patch).eq("id", campaignId);
  if (error) throw error;
}

// ---------- Leads ----------

export interface GetLeadsRequest {
  startDate: string;
  endDate: string;
  filterAdminId?: string;
  filterSubAdminId?: string;
  filterStatus?: string;
}

export async function getLeads(payload: GetLeadsRequest): Promise<Lead[]> {
  let query = getSupabaseClient()
    .from("leads")
    .select("*")
    .gte("created_at", payload.startDate)
    .lte("created_at", payload.endDate)
    .order("created_at", { ascending: false });
  if (payload.filterAdminId) query = query.eq("assigned_admin_id", payload.filterAdminId);
  if (payload.filterSubAdminId) query = query.eq("assigned_sub_admin_id", payload.filterSubAdminId);
  if (payload.filterStatus) query = query.eq("status", payload.filterStatus);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToLead);
}

export interface LeadInput {
  name: string;
  phone: string;
  status: LeadStatus;
  email?: string | null;
  source?: string | null;
  campaignId?: string | null;
  assignedAdminId?: string | null;
  assignedSubAdminId?: string | null;
  assignedCollectionAgentId?: string | null;
}

export async function createLead(actorUid: string, input: LeadInput): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("leads")
    .insert({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      phone: input.phone.trim(),
      status: input.status,
      email: optional(input.email),
      source: optional(input.source),
      campaign_id: optional(input.campaignId),
      assigned_admin_id: optional(input.assignedAdminId),
      assigned_sub_admin_id: optional(input.assignedSubAdminId),
      assigned_collection_agent_id: optional(input.assignedCollectionAgentId),
      created_by: await currentSupabaseUserId(),
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateLead(actorUid: string, leadId: string, input: Partial<LeadInput>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.phone !== undefined) patch.phone = input.phone.trim();
  if (input.status !== undefined) patch.status = input.status;
  if (input.email !== undefined) patch.email = optional(input.email);
  if (input.source !== undefined) patch.source = optional(input.source);
  if (input.campaignId !== undefined) patch.campaign_id = optional(input.campaignId);
  if (input.assignedAdminId !== undefined) patch.assigned_admin_id = optional(input.assignedAdminId);
  if (input.assignedSubAdminId !== undefined) patch.assigned_sub_admin_id = optional(input.assignedSubAdminId);
  if (input.assignedCollectionAgentId !== undefined) patch.assigned_collection_agent_id = optional(input.assignedCollectionAgentId);

  const { error } = await getSupabaseClient().from("leads").update(patch).eq("id", leadId);
  if (error) throw error;
}

export async function updateLeadStatus(actorUid: string, leadId: string, status: LeadStatus): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("leads")
    .update({ status, updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

// ---------- Segments ----------
// Computed from real rows the caller's own RLS visibility allows, not a
// Cloud Function. `approximate: true` is always reported honestly: a
// SUPER_ADMIN sees every booking so the counts are exact for them; any
// other can_manage_catalog() role is scoped by bookings_select to
// assigned/confirmed bookings only, so their counts reflect their own
// visible slice, not the whole business.
export async function getCustomerSegments(): Promise<CustomerSegmentsResult> {
  const client = getSupabaseClient();
  const { data: bookingRows, error: bookingError } = await client.from("bookings").select("user_id, created_at, coupon_id").limit(5000);
  if (bookingError) throw bookingError;
  const { count: customerCount, error: countError } = await client.from("profiles").select("id", { count: "exact", head: true });
  if (countError) throw countError;

  const byUser = new Map<string, { count: number; usedCoupon: boolean }>();
  for (const b of bookingRows ?? []) {
    if (!b.user_id) continue;
    const entry = byUser.get(b.user_id) ?? { count: 0, usedCoupon: false };
    entry.count += 1;
    if (b.coupon_id) entry.usedCoupon = true;
    byUser.set(b.user_id, entry);
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let newCount = 0;
  let returningCount = 0;
  for (const b of bookingRows ?? []) {
    if (!b.user_id) continue;
    const isFirst = byUser.get(b.user_id)!.count === 1;
    const isRecent = new Date(b.created_at as string).getTime() >= thirtyDaysAgo;
    if (isFirst && isRecent) newCount++;
  }
  returningCount = [...byUser.values()].filter((v) => v.count > 1).length;
  const couponUsers = [...byUser.values()].filter((v) => v.usedCoupon).length;
  const withBooking = byUser.size;
  const noBooking = Math.max((customerCount ?? 0) - withBooking, 0);

  return {
    segments: [
      { key: "all", label: "All customers", criteria: "Every registered customer", count: customerCount ?? 0 },
      { key: "new", label: "New (first booking, last 30 days)", criteria: "1 booking, created in the last 30 days", count: newCount },
      { key: "returning", label: "Returning", criteria: "More than one booking", count: returningCount },
      { key: "inactive", label: "No booking yet", criteria: "Registered but never booked", count: noBooking },
      { key: "couponUsers", label: "Coupon users", criteria: "At least one booking used a coupon", count: couponUsers },
      { key: "noBooking", label: "No booking yet", criteria: "Registered but never booked", count: noBooking },
    ],
    sampledBookings: (bookingRows ?? []).length,
    approximate: true,
  };
}

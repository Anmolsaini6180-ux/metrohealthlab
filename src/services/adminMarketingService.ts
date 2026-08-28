import { addDoc, collection, deleteField, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import { optionalText, stripUndefined } from "@/utils/firestoreData";
import type { Campaign, CampaignStatus, Lead, LeadStatus } from "@/types/marketing";

// Optional text fields follow the same three-way convention as the
// catalog service (see adminCatalogService.TestCategoryInput):
//   absent    -> leave the stored value alone
//   "" / null -> the admin cleared it; remove the field from the doc
//   "value"   -> set it
// `undefined` is never a meaningful value and is never written —
// Firestore rejects it outright.

// ---------- Campaigns ----------
// Direct Firestore writes, same rules-gated pattern as the catalog
// (canManageCatalog() + updatedBy check) — campaigns aren't money- or
// capacity-sensitive the way bookings/payments are.

export async function getAllCampaigns(): Promise<Campaign[]> {
  const q = query(collection(getDb(), "campaigns"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
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
  // Blank optional fields are dropped, so a new campaign simply has no
  // `description`/`offerId`/`couponId` key rather than an `undefined`
  // one that addDoc() would refuse.
  const ref = await addDoc(
    collection(getDb(), "campaigns"),
    stripUndefined({
      name: input.name.trim(),
      type: input.type.trim(),
      startAt: input.startAt,
      endAt: input.endAt,
      status: input.status,
      description: optionalText(input.description),
      offerId: optionalText(input.offerId),
      couponId: optionalText(input.couponId),
      targetSegment: optionalText(input.targetSegment),
      createdBy: actorUid,
      updatedBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  return ref.id;
}

export async function updateCampaign(
  actorUid: string,
  campaignId: string,
  input: Partial<CampaignInput>
): Promise<void> {
  const patch: Record<string, unknown> = { updatedBy: actorUid, updatedAt: serverTimestamp() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.type !== undefined) patch.type = input.type.trim();
  if (input.startAt !== undefined) patch.startAt = input.startAt;
  if (input.endAt !== undefined) patch.endAt = input.endAt;
  if (input.status !== undefined) patch.status = input.status;
  // Unlinking an offer or coupon from a campaign has to remove the
  // field; omitting the key would silently keep the old link.
  if (input.description !== undefined) patch.description = optionalText(input.description) ?? deleteField();
  if (input.offerId !== undefined) patch.offerId = optionalText(input.offerId) ?? deleteField();
  if (input.couponId !== undefined) patch.couponId = optionalText(input.couponId) ?? deleteField();
  if (input.targetSegment !== undefined) patch.targetSegment = optionalText(input.targetSegment) ?? deleteField();

  await updateDoc(doc(getDb(), "campaigns", campaignId), stripUndefined(patch));
}

// ---------- Leads ----------

export interface GetLeadsRequest {
  startDate: string;
  endDate: string;
  filterAdminId?: string;
  filterSubAdminId?: string;
  filterStatus?: string;
}

// Hierarchy-scoped server-side — see functions/src/adminQueries.ts.
export async function getLeads(payload: GetLeadsRequest): Promise<Lead[]> {
  const result = await callFunction<GetLeadsRequest, { leads: Lead[] }>("getLeads", payload);
  return result.leads;
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

// The optional assignment fields are what the hierarchy-scoped read
// rules key off (see firestore.rules leads/{id}), so they are cleared
// by removing them rather than by storing an empty string that would
// never match a uid.
const OPTIONAL_LEAD_FIELDS = [
  "email",
  "source",
  "campaignId",
  "assignedAdminId",
  "assignedSubAdminId",
  "assignedCollectionAgentId",
] as const;

export async function createLead(actorUid: string, input: LeadInput): Promise<string> {
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    status: input.status,
    createdBy: actorUid,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  for (const key of OPTIONAL_LEAD_FIELDS) {
    payload[key] = optionalText(input[key]);
  }

  const ref = await addDoc(collection(getDb(), "leads"), stripUndefined(payload));
  return ref.id;
}

export async function updateLead(actorUid: string, leadId: string, input: Partial<LeadInput>): Promise<void> {
  const patch: Record<string, unknown> = { updatedBy: actorUid, updatedAt: serverTimestamp() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.phone !== undefined) patch.phone = input.phone.trim();
  if (input.status !== undefined) patch.status = input.status;
  for (const key of OPTIONAL_LEAD_FIELDS) {
    const value = input[key];
    if (value === undefined) continue;
    patch[key] = optionalText(value) ?? deleteField();
  }

  await updateDoc(doc(getDb(), "leads", leadId), stripUndefined(patch));
}

export async function updateLeadStatus(actorUid: string, leadId: string, status: LeadStatus): Promise<void> {
  await updateDoc(doc(getDb(), "leads", leadId), { status, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

// ---------- Segments ----------

export interface CustomerSegmentsResult {
  segments: { key: string; label: string; criteria: string; count: number }[];
  sampledBookings: number;
  approximate: boolean;
}

export async function getCustomerSegments(): Promise<CustomerSegmentsResult> {
  return callFunction<Record<string, never>, CustomerSegmentsResult>("getCustomerSegments", {});
}

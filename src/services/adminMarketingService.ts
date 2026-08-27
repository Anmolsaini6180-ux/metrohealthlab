import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import type { Campaign, Lead, LeadStatus } from "@/types/marketing";

// ---------- Campaigns ----------
// Direct Firestore writes, same rules-gated pattern as the catalog
// (canManageCatalog() + updatedBy check) — campaigns aren't money- or
// capacity-sensitive the way bookings/payments are.

export async function getAllCampaigns(): Promise<Campaign[]> {
  const q = query(collection(getDb(), "campaigns"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
}

export async function createCampaign(
  actorUid: string,
  data: Omit<Campaign, "id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "campaigns"), {
    ...data,
    createdBy: actorUid,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCampaign(
  actorUid: string,
  campaignId: string,
  data: Partial<Omit<Campaign, "id" | "createdBy" | "updatedBy" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), "campaigns", campaignId), { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() });
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

export async function createLead(
  actorUid: string,
  data: Omit<Lead, "id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "leads"), {
    ...data,
    createdBy: actorUid,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLead(
  actorUid: string,
  leadId: string,
  data: Partial<Omit<Lead, "id" | "createdBy" | "updatedBy" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), "leads", leadId), { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() });
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

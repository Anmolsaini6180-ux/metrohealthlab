// getUserReports is Supabase-backed. getSecureDownloadUrl still calls a
// Firebase Cloud Function that has never been deployed (Spark plan, no
// functions block) — requireBackend() already turns that into a
// truthful "requires backend service" state rather than a broken call,
// so it is left exactly as-is rather than silently pointing at nothing.
// Replacing it is Edge-Function work (Phase M), not a Firestore->
// Supabase data swap.
import { getSupabaseClient } from "@/supabase/client";
import { callFunction } from "@/firebase/functions";
import { requireBackend } from "@/services/backendCapability";
import type { Report } from "@/types/report";

export async function getUserReports(userId: string): Promise<Report[]> {
  const { data, error } = await getSupabaseClient()
    .from("reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    patientId: r.patient_id ?? "",
    bookingId: r.booking_id ?? "",
    testId: r.test_id ?? undefined,
    packageId: r.package_id ?? undefined,
    labId: r.lab_id ?? "",
    status: r.status,
    storageProvider: r.storage_provider ?? undefined,
    publicId: r.public_id ?? undefined,
    assetId: r.asset_id ?? undefined,
    resourceType: r.resource_type ?? undefined,
    format: r.format ?? undefined,
    bytes: r.bytes ?? undefined,
    filename: r.filename ?? undefined,
    folder: r.folder ?? undefined,
    uploadedBy: r.uploaded_by ?? undefined,
    uploadedAt: r.uploaded_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }) as Report);
}

export interface SecureDownloadUrlResponse {
  url: string;
  expiresAt: string;
}

export async function getSecureDownloadUrl(reportId: string): Promise<SecureDownloadUrlResponse> {
  requireBackend("reportDownload");
  return callFunction<{ reportId: string }, SecureDownloadUrlResponse>("getReportDownloadUrl", { reportId });
}

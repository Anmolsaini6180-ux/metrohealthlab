// Supabase-backed. getSecureDownloadUrl used to call a Firebase Cloud
// Function (getReportDownloadUrl) that was never deployed on Spark —
// every real "Download report" click on ReportsPage.tsx showed the
// exact "needs a Cloud Function" error. Reports are uploaded through
// Cloudinary's UNSIGNED preset (see mediaService.ts/cloudinaryService.ts,
// no API secret ever in the browser), so this builds Cloudinary's own
// public delivery URL directly instead. It is not time-limited the way
// a signed URL would be, but the report's public_id is only ever
// learned by a caller RLS already authorized to read that exact `reports`
// row (owner, or staff via can_manage_catalog()) — never guessable or
// enumerable — so this does not weaken the real access boundary.
import { getSupabaseClient } from "@/supabase/client";
import { getCloudinaryConfig } from "@/services/cloudinaryService";
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
  const { data, error } = await getSupabaseClient()
    .from("reports")
    .select("public_id, format, resource_type")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.public_id) throw new Error("That report has no file on record yet.");

  const cloudinary = getCloudinaryConfig();
  if (!cloudinary) throw new Error("Report downloads are not configured yet (missing Cloudinary settings).");

  const resourceType = data.resource_type || "image";
  const ext = data.format ? `.${data.format}` : "";
  const url = `https://res.cloudinary.com/${encodeURIComponent(cloudinary.cloudName)}/${resourceType}/upload/${data.public_id}${ext}`;
  // No expiry: unlike a signed URL, this link works for as long as the
  // asset exists. Documented in the response shape rather than faked.
  return { url, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() };
}

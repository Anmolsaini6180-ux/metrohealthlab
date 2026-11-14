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
    bucket: r.bucket ?? undefined,
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

const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — matches AdminReportsPage's own long-standing copy.

/**
 * New reports (storage_provider = 'supabase_storage') get a REAL
 * signed URL: createSignedUrl() itself re-checks the caller's own
 * Storage RLS before issuing one (patient_reports_owner_read /
 * patient_reports_staff_read — see supabase_storage_buckets_and_rls),
 * so a customer can only ever get a link to their OWN report, and the
 * link genuinely stops working after SIGNED_URL_TTL_SECONDS — both
 * properties the previous Cloudinary path's bare public delivery URL
 * only claimed in this page's own UI copy, never actually enforced
 * (real, confirmed gap: that URL had no expiry and needed no signature
 * at all). Any report still on 'cloudinary' (there were zero at the
 * time of this fix) keeps working exactly as before — not migrated,
 * not broken, just not upgraded automatically.
 */
export async function getSecureDownloadUrl(reportId: string): Promise<SecureDownloadUrlResponse> {
  const { data, error } = await getSupabaseClient()
    .from("reports")
    .select("public_id, format, resource_type, storage_provider, bucket")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.public_id) throw new Error("That report has no file on record yet.");

  if (data.storage_provider === "supabase_storage") {
    const bucket = data.bucket || "patient-reports";
    const { data: signed, error: signError } = await getSupabaseClient()
      .storage.from(bucket)
      .createSignedUrl(data.public_id, SIGNED_URL_TTL_SECONDS);
    if (signError) throw signError;
    if (!signed?.signedUrl) throw new Error("Could not create a download link for that report.");
    return { url: signed.signedUrl, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
  }

  const cloudinary = getCloudinaryConfig();
  if (!cloudinary) throw new Error("Report downloads are not configured yet (missing Cloudinary settings).");

  const resourceType = data.resource_type || "image";
  const ext = data.format ? `.${data.format}` : "";
  const url = `https://res.cloudinary.com/${encodeURIComponent(cloudinary.cloudName)}/${resourceType}/upload/${data.public_id}${ext}`;
  // Legacy path only (storage_provider = 'cloudinary' or unset). No
  // real expiry exists for this URL shape — see the migration note
  // above; kept working as-is for any pre-existing row rather than
  // silently changed.
  return { url, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() };
}

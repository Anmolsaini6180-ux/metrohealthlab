// Supabase-backed. Uploads go browser -> Cloudinary directly through an
// UNSIGNED preset (cloudinaryService.ts) -- no Cloud Function, no
// secret, ever reachable from this file; the preset's own server-side
// restrictions (folder, formats, size, delivery type) are the real
// containment, configured once in the Cloudinary console.
//
// The shared media library index (`media_assets`) is a direct table
// write covered by RLS (media_assets_all_staff = can_manage_catalog()).
// `reports` has no client write policy at all, so filing/updating a
// report goes through the confirm_report_upload / set_report_status
// RPCs (Phase H), which derive the report's owner from the booking
// server-side rather than trusting a browser-supplied customer id.
import { getSupabaseClient } from "@/supabase/client";
import { uploadToCloudinary } from "@/services/cloudinaryService";
import { rowToMediaAsset } from "@/supabase/mappers";
import type { MediaAsset, MediaCategory } from "@/types/media";

export async function uploadMedia(file: File, category: MediaCategory, relatedId?: string): Promise<MediaAsset> {
  const result = await uploadToCloudinary(file, { folder: category });
  const { data: row, error } = await getSupabaseClient()
    .from("media_assets")
    .insert({
      public_id: result.publicId,
      asset_id: result.publicId,
      category,
      related_id: relatedId ?? null,
      resource_type: result.resourceType,
      format: result.format,
      bytes: result.bytes,
      width: result.width ?? null,
      height: result.height ?? null,
      folder: result.folder ?? category,
      filename: result.originalFilename ?? file.name,
      secure_url: result.secureUrl,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToMediaAsset(row);
}

export async function deleteMedia(mediaAssetId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("media_assets").delete().eq("id", mediaAssetId);
  if (error) throw error;
}

export async function listMedia(category?: MediaCategory): Promise<MediaAsset[]> {
  let query = getSupabaseClient().from("media_assets").select("*").order("uploaded_at", { ascending: false }).limit(200);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToMediaAsset);
}

// ---------- Reports ----------

export interface ReportUploadResult {
  reportId: string;
}

export async function uploadReportFile(params: {
  file: File;
  bookingId: string;
  patientId?: string;
  labId?: string;
  testId?: string;
  packageId?: string;
  reportId?: string;
}): Promise<ReportUploadResult> {
  const result = await uploadToCloudinary(params.file, { folder: "reports" });
  const { data, error } = await getSupabaseClient().rpc("confirm_report_upload", {
    p_booking_id: params.bookingId,
    p_public_id: result.publicId,
    p_asset_id: result.publicId,
    p_resource_type: result.resourceType,
    p_format: result.format,
    p_bytes: result.bytes,
    p_filename: result.originalFilename ?? params.file.name,
    p_folder: result.folder ?? "reports",
    p_test_id: params.testId ?? null,
    p_package_id: params.packageId ?? null,
  });
  if (error) throw error;
  return { reportId: (data as unknown as { id: string }).id };
}

export async function setReportReady(reportId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("set_report_status", {
    p_report_id: reportId,
    p_status: "ready",
  });
  if (error) throw error;
}

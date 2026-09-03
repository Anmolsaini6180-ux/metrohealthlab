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
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { uploadToCloudinary } from "@/services/cloudinaryService";
import { rowToMediaAsset } from "@/supabase/mappers";
import type { MediaAsset, MediaCategory } from "@/types/media";

type Unsubscribe = () => void;

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

/** Everything the ImagePicker's own edit form can change after upload —
 * none of it touches Cloudinary, only the library's own metadata. */
export async function updateMediaMetadata(
  id: string,
  patch: Partial<Pick<MediaAsset, "title" | "altText" | "active" | "sortOrder">>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title || null;
  if (patch.altText !== undefined) row.alt_text = patch.altText || null;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await getSupabaseClient().from("media_assets").update(row).eq("id", id);
  if (error) throw error;
}

/** Re-assigns an already-uploaded asset to a different slot — the
 * "Use Image" step of the ImagePicker workflow: browse the library,
 * pick one, point it at (category, relatedId) instead of uploading a
 * new file. relatedId null clears any previous specific target within
 * that category (a category-level default, e.g. a generic banner). */
export async function assignMedia(id: string, category: MediaCategory, relatedId: string | null): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("media_assets")
    .update({ category, related_id: relatedId })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Public-consumption lookup: the single best active asset assigned to
 * one specific slot (category + relatedId), lowest sort_order first
 * then most recent. Returns null rather than throwing when nothing is
 * assigned yet — every caller falls back to its own honest "not
 * configured" treatment, never a fabricated image.
 */
export async function getAssignedMedia(category: MediaCategory, relatedId: string): Promise<MediaAsset | null> {
  const { data, error } = await getSupabaseClient()
    .from("media_assets")
    .select("*")
    .eq("category", category)
    .eq("related_id", relatedId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToMediaAsset(data) : null;
}

/**
 * Batch form of getAssignedMedia for a list rendered together (the
 * category rail, a package grid) — one query instead of one per row.
 * Returns a Map keyed by relatedId; a missing key means nothing is
 * assigned to that row yet.
 */
export async function getAssignedMediaMap(category: MediaCategory, relatedIds: string[]): Promise<Map<string, MediaAsset>> {
  if (relatedIds.length === 0) return new Map();
  const { data, error } = await getSupabaseClient()
    .from("media_assets")
    .select("*")
    .eq("category", category)
    .in("related_id", relatedIds)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  const map = new Map<string, MediaAsset>();
  for (const row of data ?? []) {
    const asset = rowToMediaAsset(row);
    // Rows already arrive best-first per the ORDER BY above; keep only
    // the first one seen for each relatedId.
    if (asset.relatedId && !map.has(asset.relatedId)) map.set(asset.relatedId, asset);
  }
  return map;
}

/** Live version of getAssignedMedia for pages that stay open a while
 * (Home) — an admin reassigning the slot updates the image with no
 * refresh, same realtime contract every other public read already has. */
export function subscribeToAssignedMedia(
  category: MediaCategory,
  relatedId: string,
  callback: (asset: MediaAsset | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getAssignedMedia(category, relatedId).then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`media-${category}-${relatedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "media_assets", filter: `related_id=eq.${relatedId}` }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
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

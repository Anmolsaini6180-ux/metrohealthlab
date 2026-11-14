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
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
import { uploadToCloudinary } from "@/services/cloudinaryService";
import { rowToMediaAsset } from "@/supabase/mappers";
import type { MediaAsset, MediaCategory } from "@/types/media";

type Unsubscribe = () => void;

export async function uploadMedia(
  file: File,
  category: MediaCategory,
  relatedId?: string,
  onProgress?: (percent: number) => void
): Promise<MediaAsset> {
  const result = await uploadToCloudinary(file, { folder: category, onProgress });
  const { data: row, error } = await getSupabaseClient()
    .from("media_assets")
    .insert({
      // media_assets.id is `text not null` with NO column default and
      // no insert trigger — REAL, CONFIRMED BUG found while working
      // this section: every upload through this function has always
      // thrown a 23502 not-null violation and never actually
      // persisted a row (the live table had zero rows, for every
      // category, not just the newer ones — this was broken from the
      // start, not something that regressed). Same client-generated-
      // uuid pattern already used for packages/tests/addresses/patients.
      id: crypto.randomUUID(),
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
  return subscribeToTableChanges(
    `media-${category}-${relatedId}`,
    { event: "*", schema: "public", table: "media_assets", filter: `related_id=eq.${relatedId}` },
    refetch,
    onError
  );
}

// ---------- Reports ----------

export interface ReportUploadResult {
  reportId: string;
}

const REPORT_BUCKET = "patient-reports";
const REPORT_ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const REPORT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Strips a filename down to characters safe in a Storage object path —
 * never trusts the original name as-is (it comes straight from the
 * admin's filesystem and could contain "../", spaces, unicode, or
 * anything else a path shouldn't). The bucket's own allowed_mime_types/
 * file_size_limit (see the supabase_storage_buckets_and_rls and
 * storage_bucket_mime_and_size_limits migrations) are the REAL
 * boundary — enforced server-side regardless of what this file's own
 * reported .type/.name claim — these checks are just fast, friendly
 * client-side feedback before even attempting the upload.
 */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120);
  return cleaned || "file";
}

/**
 * Reports live in the PRIVATE patient-reports bucket, browser -> Storage
 * directly (RLS restricts writes there to staff — can_manage_catalog()
 * — same gate every other report-management action already uses). The
 * object path's first segment is the booking's own customer, so the
 * owner-read RLS policy can later match it against auth.uid() — a
 * WhatsApp booking never linked to a real account has no such uid, so
 * "unassigned" is used instead (nobody's owner-read policy can ever
 * match that literal string, which is correct: only staff can read an
 * unlinked booking's report, exactly as before).
 */
export async function uploadReportFile(params: {
  file: File;
  bookingId: string;
  patientId?: string;
  labId?: string;
  testId?: string;
  packageId?: string;
  reportId?: string;
}): Promise<ReportUploadResult> {
  if (!REPORT_ALLOWED_TYPES.has(params.file.type)) {
    throw new Error("Reports must be a PDF, JPEG, PNG or WebP file.");
  }
  if (params.file.size > REPORT_MAX_BYTES) {
    throw new Error("Report file is too large (20 MB max).");
  }

  const client = getSupabaseClient();
  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("user_id")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("That booking no longer exists.");

  const ownerSegment = (booking.user_id as string | null) ?? "unassigned";
  const objectPath = `${ownerSegment}/${crypto.randomUUID()}-${safeFilename(params.file.name)}`;

  const { error: uploadError } = await client.storage.from(REPORT_BUCKET).upload(objectPath, params.file, {
    contentType: params.file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await client.rpc("confirm_report_upload_storage", {
    p_booking_id: params.bookingId,
    p_bucket: REPORT_BUCKET,
    p_object_path: objectPath,
    p_format: params.file.name.split(".").pop() ?? "",
    p_bytes: params.file.size,
    p_filename: params.file.name,
    p_test_id: params.testId ?? null,
    p_package_id: params.packageId ?? null,
  });
  if (error) {
    // The metadata row is what actually makes a report exist anywhere
    // in the product — an orphaned Storage object with no reports row
    // is inert (unreachable by any RLS policy that matches on booking/
    // report data, unlisted anywhere) rather than a dangling reference
    // to something that no longer resolves, so it's safe to leave for
    // manual cleanup rather than risk masking this real error with a
    // second failure from the cleanup attempt itself.
    throw error;
  }
  return { reportId: (data as unknown as { id: string }).id };
}

export async function setReportReady(reportId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("set_report_status", {
    p_report_id: reportId,
    p_status: "ready",
  });
  if (error) throw error;
}

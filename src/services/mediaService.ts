import { collection, getDocs, orderBy, query, where, limit as fsLimit } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import type { MediaAsset, MediaCategory } from "@/types/media";

const MEDIA_ASSETS = "mediaAssets";

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
  resourceType: string;
  uploadUrl: string;
  maxBytes: number;
  type?: string;
}

// The Cloudinary API secret never reaches this file. The backend hands
// back a signature that is only valid for one exact folder + public_id
// + timestamp, so the browser can upload that one asset and nothing
// else. The upload itself goes browser → Cloudinary directly (large
// files never pass through Cloud Functions), and the resulting record
// is only trusted once the backend has independently verified it with
// Cloudinary.
async function uploadToCloudinary(file: File, sig: UploadSignature): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("public_id", sig.publicId);
  if (sig.type) form.append("type", sig.type);
  form.append("signature", sig.signature);

  const res = await fetch(sig.uploadUrl, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      /* non-JSON error body — fall through to the generic message */
    }
    throw new Error(detail || `Upload failed (${res.status}). Please try again.`);
  }
}

export async function uploadMedia(
  file: File,
  category: MediaCategory,
  relatedId?: string
): Promise<MediaAsset> {
  const sig = await callFunction<{ category: MediaCategory; relatedId?: string }, UploadSignature>(
    "getMediaUploadSignature",
    { category, relatedId }
  );

  if (file.size > sig.maxBytes) {
    throw new Error(`That file is too large (max ${Math.round(sig.maxBytes / 1024 / 1024)} MB).`);
  }

  await uploadToCloudinary(file, sig);

  return callFunction<
    { publicId: string; category: MediaCategory; relatedId?: string; filename?: string },
    MediaAsset
  >("confirmMediaUpload", {
    publicId: sig.publicId,
    category,
    relatedId,
    filename: file.name,
  });
}

export async function deleteMedia(mediaAssetId: string): Promise<void> {
  await callFunction<{ mediaAssetId: string }, { ok: true }>("deleteMediaAsset", { mediaAssetId });
}

export async function listMedia(category?: MediaCategory): Promise<MediaAsset[]> {
  const base = collection(getDb(), MEDIA_ASSETS);
  const q = category
    ? query(base, where("category", "==", category), orderBy("uploadedAt", "desc"), fsLimit(200))
    : query(base, orderBy("uploadedAt", "desc"), fsLimit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MediaAsset);
}

// ---------- Reports ----------

export interface ReportUploadResult {
  reportId: string;
}

// Same two-phase flow, but the report's owner is derived server-side
// from the booking — the browser only ever names a booking, never a
// customer.
export async function uploadReportFile(params: {
  file: File;
  bookingId: string;
  patientId?: string;
  labId?: string;
  testId?: string;
  packageId?: string;
  reportId?: string;
}): Promise<ReportUploadResult> {
  const sig = await callFunction<{ bookingId: string }, UploadSignature>("getReportUploadSignature", {
    bookingId: params.bookingId,
  });

  if (params.file.size > sig.maxBytes) {
    throw new Error(`That file is too large (max ${Math.round(sig.maxBytes / 1024 / 1024)} MB).`);
  }

  await uploadToCloudinary(params.file, sig);

  return callFunction<Record<string, unknown>, ReportUploadResult>("confirmReportUpload", {
    publicId: sig.publicId,
    bookingId: params.bookingId,
    patientId: params.patientId,
    labId: params.labId,
    testId: params.testId,
    packageId: params.packageId,
    filename: params.file.name,
    reportId: params.reportId,
  });
}

export async function setReportReady(reportId: string): Promise<void> {
  await callFunction<{ reportId: string }, { ok: true; alreadyReady: boolean }>("setReportReady", {
    reportId,
  });
}

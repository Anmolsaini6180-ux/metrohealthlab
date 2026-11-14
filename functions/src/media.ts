import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { db } from "./admin";
import { requireCatalogManager } from "./roleClaims";
import { writeAuditLogDirect } from "./audit";
import {
  CLOUDINARY_SECRETS,
  configuredCloudinary,
  cloudinaryApiKey,
  cloudinaryCloudName,
  cloudinaryApiSecret,
  isMediaFolder,
  MAX_IMAGE_BYTES,
  type MediaFolder,
} from "./cloudinaryConfig";

const MEDIA_ASSETS = "mediaAssets";

// Which entity a media asset belongs to. `relatedId` is free-form (a
// test/package/lab document id, or "branding"/"banner:<id>") — it's
// metadata for the admin library, never used for authorization.
export type MediaCategory = "branding" | "banners" | "tests" | "packages" | "labs";

const CATEGORY_TO_FOLDER: Record<MediaCategory, MediaFolder> = {
  branding: "metro-health/branding",
  banners: "metro-health/banners",
  tests: "metro-health/tests",
  packages: "metro-health/packages",
  labs: "metro-health/labs",
};

function folderForCategory(category: unknown): MediaFolder {
  const folder = CATEGORY_TO_FOLDER[category as MediaCategory];
  if (!folder || !isMediaFolder(folder)) {
    throw new HttpsError("invalid-argument", "Unknown media category.");
  }
  return folder;
}

interface SignatureInput {
  category: MediaCategory;
  relatedId?: string;
}

interface SignatureResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
  resourceType: "image";
  uploadUrl: string;
  maxBytes: number;
}

// Step 1 of the upload flow. The browser never sees the API secret —
// it receives a signature that is only valid for this exact
// (timestamp, folder, public_id) triple, so an attacker holding a
// leaked signature still cannot upload anywhere else or overwrite a
// different asset. The public_id is generated server-side, which is
// what makes overwriting an existing asset impossible from the client.
export const getMediaUploadSignature = onCall<SignatureInput, Promise<SignatureResponse>>(
  { secrets: CLOUDINARY_SECRETS },
  async (request) => {
    requireCatalogManager(request);

    const folder = folderForCategory(request.data?.category);
    const cloudinary = configuredCloudinary();

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `${folder}/${randomUUID()}`;

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, public_id: publicId },
      cloudinaryApiSecret.value()
    );

    return {
      cloudName: cloudinaryCloudName.value(),
      apiKey: cloudinaryApiKey.value(),
      timestamp,
      folder,
      publicId,
      signature,
      resourceType: "image",
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinaryCloudName.value()}/image/upload`,
      maxBytes: MAX_IMAGE_BYTES,
    };
  }
);

interface ConfirmInput {
  publicId: string;
  category: MediaCategory;
  relatedId?: string;
  filename?: string;
}

export interface MediaAssetRecord {
  id: string;
  publicId: string;
  assetId: string;
  category: MediaCategory;
  relatedId: string | null;
  resourceType: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  folder: string;
  filename: string;
  secureUrl: string;
  uploadedBy: string;
}

// Step 2. The client reports "I uploaded this public_id", and the
// server independently asks Cloudinary what actually exists at that
// id. Every stored field comes from Cloudinary's answer, never from
// the request body — so a client cannot fabricate a media record, lie
// about the size/type, or point a record at somebody else's asset.
export const confirmMediaUpload = onCall<ConfirmInput, Promise<MediaAssetRecord>>(
  { secrets: CLOUDINARY_SECRETS },
  async (request) => {
    const { uid } = requireCatalogManager(request);
    const { publicId, category, relatedId, filename } = request.data ?? {};

    const folder = folderForCategory(category);
    if (typeof publicId !== "string" || !publicId.startsWith(`${folder}/`)) {
      throw new HttpsError("invalid-argument", "That asset isn't in the expected folder.");
    }

    const cloudinary = configuredCloudinary();
    let resource;
    try {
      resource = await cloudinary.api.resource(publicId, { resource_type: "image" });
    } catch {
      throw new HttpsError("not-found", "That upload wasn't found in Cloudinary.");
    }

    if (resource.bytes > MAX_IMAGE_BYTES) {
      // Cloudinary already has it — remove it rather than record an
      // oversized asset the admin library would then serve.
      await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
      throw new HttpsError("invalid-argument", "That image is too large.");
    }

    const record = {
      publicId: resource.public_id as string,
      assetId: (resource.asset_id as string) ?? "",
      category: category as MediaCategory,
      relatedId: typeof relatedId === "string" && relatedId ? relatedId : null,
      resourceType: resource.resource_type as string,
      format: resource.format as string,
      bytes: resource.bytes as number,
      width: (resource.width as number) ?? null,
      height: (resource.height as number) ?? null,
      folder,
      filename: typeof filename === "string" && filename ? filename.slice(0, 200) : (resource.public_id as string),
      secureUrl: resource.secure_url as string,
      uploadedBy: uid,
      uploadedAt: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection(MEDIA_ASSETS).add(record);

    await writeAuditLogDirect({
      action: "media.uploaded",
      actorType: "staff",
      actorId: uid,
      targetType: "mediaAsset",
      targetId: ref.id,
      metadata: { category, publicId: record.publicId, relatedId: record.relatedId },
    });

    const { uploadedAt: _uploadedAt, ...rest } = record;
    return { id: ref.id, ...rest };
  }
);

interface DeleteInput {
  mediaAssetId: string;
}

// Removes the asset from Cloudinary AND its Firestore record. Deleting
// from Cloudinary first means a failure here leaves the record in
// place (visible, retryable) rather than an orphaned file nobody can
// see or clean up.
export const deleteMediaAsset = onCall<DeleteInput, Promise<{ ok: true }>>(
  { secrets: CLOUDINARY_SECRETS },
  async (request) => {
    const { uid } = requireCatalogManager(request);
    const { mediaAssetId } = request.data ?? {};
    if (typeof mediaAssetId !== "string" || !mediaAssetId) {
      throw new HttpsError("invalid-argument", "Missing media asset id.");
    }

    const ref = db.collection(MEDIA_ASSETS).doc(mediaAssetId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "That media asset no longer exists.");
    const asset = snap.data()!;

    const cloudinary = configuredCloudinary();
    await cloudinary.uploader.destroy(asset.publicId as string, {
      resource_type: (asset.resourceType as string) ?? "image",
      invalidate: true,
    });

    await ref.delete();

    await writeAuditLogDirect({
      action: "media.deleted",
      actorType: "staff",
      actorId: uid,
      targetType: "mediaAsset",
      targetId: mediaAssetId,
      metadata: { publicId: asset.publicId, category: asset.category },
    });

    return { ok: true };
  }
);

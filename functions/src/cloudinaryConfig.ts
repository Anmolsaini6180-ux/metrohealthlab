import { defineSecret } from "firebase-functions/params";
import { v2 as cloudinary } from "cloudinary";

// Set with:
//   firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
//   firebase functions:secrets:set CLOUDINARY_API_KEY
//   firebase functions:secrets:set CLOUDINARY_API_SECRET
//
// CLOUDINARY_API_SECRET is a true secret and must never reach the
// browser. cloud_name and api_key are values Cloudinary itself embeds
// in signed upload requests from the browser — they are handed to the
// client only as part of a signature response, never bundled into the
// frontend build, so rotating the Cloudinary account never requires a
// redeploy of the frontend.
export const cloudinaryCloudName = defineSecret("CLOUDINARY_CLOUD_NAME");
export const cloudinaryApiKey = defineSecret("CLOUDINARY_API_KEY");
export const cloudinaryApiSecret = defineSecret("CLOUDINARY_API_SECRET");

export const CLOUDINARY_SECRETS = [cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret];

// Configures the SDK per-invocation from Secret Manager values. Called
// at the top of every Cloudinary-touching handler rather than at module
// load, because secret values are only bound once the function is
// actually invoked.
export function configuredCloudinary() {
  cloudinary.config({
    cloud_name: cloudinaryCloudName.value(),
    api_key: cloudinaryApiKey.value(),
    api_secret: cloudinaryApiSecret.value(),
    secure: true,
  });
  return cloudinary;
}

// The only folders the signature endpoint will ever authorize. A client
// cannot invent a folder name and cannot write outside this tree,
// because the folder is baked into the signed payload — Cloudinary
// rejects any upload whose parameters don't match the signature.
export const MEDIA_FOLDERS = [
  "metro-health/branding",
  "metro-health/banners",
  "metro-health/tests",
  "metro-health/packages",
  "metro-health/labs",
] as const;

export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

// Reports are health data and live in their own tree, uploaded as
// `authenticated` assets so no unsigned URL can ever fetch them.
export const REPORTS_FOLDER = "metro-health/reports";

export function isMediaFolder(value: unknown): value is MediaFolder {
  return typeof value === "string" && (MEDIA_FOLDERS as readonly string[]).includes(value);
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_REPORT_BYTES = 25 * 1024 * 1024; // 25 MB

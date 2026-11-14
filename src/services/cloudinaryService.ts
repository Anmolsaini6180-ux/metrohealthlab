// Browser-safe Cloudinary uploads.
//
// The signed-upload flow this app originally used needed a Cloud
// Function to mint a signature from CLOUDINARY_API_SECRET. That
// function is not deployed (Spark plan), so uploads go through an
// UNSIGNED upload preset instead: the preset itself carries the
// restrictions (allowed formats, max size, target folder, delivery
// type), configured once in the Cloudinary console.
//
// NOTHING SECRET IS IN THIS FILE OR THE BUNDLE. A cloud name and an
// unsigned preset name are public by design — they are what the preset's
// own server-side restrictions are there to contain. The API secret is
// never referenced here, and must never be added as a VITE_* variable.
//
// What this can and cannot do on Spark:
//   CAN  — upload an image and hand back its delivered URL, which the
//          caller stores in a Firestore document it is already allowed
//          to write (settings/branding, banners, offers, articles).
//   CANNOT — write the shared `mediaAssets` index or a `reports` row;
//          both are write-denied to clients by firestore.rules, and
//          that protection is not something an upload widget should
//          route around. See backendCapability.ts.

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  resourceType: string;
  format: string;
  bytes: number;
  originalFilename?: string;
  width?: number;
  height?: number;
  folder?: string;
}

export type CloudinaryErrorKind =
  | "NOT_CONFIGURED"
  | "INVALID_TYPE"
  | "TOO_LARGE"
  | "NETWORK"
  | "REJECTED"
  | "ABORTED";

export class CloudinaryUploadError extends Error {
  constructor(
    readonly kind: CloudinaryErrorKind,
    message: string
  ) {
    super(message);
    this.name = "CloudinaryUploadError";
  }
}

interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

/**
 * Reads the two public browser variables. Returns null (rather than
 * throwing) so a page can show a specific "not configured yet" state
 * instead of a failed upload.
 */
export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (typeof cloudName !== "string" || !cloudName.trim()) return null;
  if (typeof uploadPreset !== "string" || !uploadPreset.trim()) return null;
  return { cloudName: cloudName.trim(), uploadPreset: uploadPreset.trim() };
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfig() !== null;
}

// Client-side limits. These are a fast, friendly first check only — the
// upload preset enforces the real ones server-side, because anything
// checked here can be bypassed.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export interface UploadOptions {
  /** Folder inside the preset's allowed root, e.g. "branding". */
  folder?: string;
  maxBytes?: number;
  allowedTypes?: string[];
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function humanMb(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

/**
 * Uploads one file straight from the browser to Cloudinary.
 *
 * Uses XMLHttpRequest rather than fetch purely because fetch cannot
 * report upload progress, and a multi-megabyte image with no progress
 * bar reads as a frozen page.
 */
export function uploadToCloudinary(file: File, options: UploadOptions = {}): Promise<CloudinaryUploadResult> {
  const config = getCloudinaryConfig();
  if (!config) {
    return Promise.reject(
      new CloudinaryUploadError(
        "NOT_CONFIGURED",
        "Image uploads are not configured yet. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET, then reload."
      )
    );
  }

  const allowed = options.allowedTypes ?? ALLOWED_IMAGE_TYPES;
  if (file.type && !allowed.includes(file.type)) {
    return Promise.reject(
      new CloudinaryUploadError(
        "INVALID_TYPE",
        `That file type (${file.type}) is not allowed. Use ${allowed.map((t) => t.replace("image/", "")).join(", ")}.`
      )
    );
  }

  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return Promise.reject(
      new CloudinaryUploadError("TOO_LARGE", `That file is ${humanMb(file.size)}. The limit is ${humanMb(maxBytes)}.`)
    );
  }

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", config.uploadPreset);
  // Only sent when the caller asks; an unsigned preset configured with
  // a fixed folder will ignore or reject an override, which is the
  // safer default.
  if (options.folder) form.append("folder", options.folder);

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`;

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onerror = () =>
      reject(new CloudinaryUploadError("NETWORK", "The upload could not reach Cloudinary. Check your connection and retry."));

    xhr.onabort = () => reject(new CloudinaryUploadError("ABORTED", "Upload cancelled."));

    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* fall through to the status-based message below */
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const detail = (body.error as { message?: string } | undefined)?.message;
        // Cloudinary's own wording is safe to show: it never contains a
        // credential, and "Upload preset not found" is precisely the
        // hint whoever is configuring this needs.
        reject(
          new CloudinaryUploadError(
            "REJECTED",
            detail ? `Cloudinary rejected the upload: ${detail}` : `Cloudinary rejected the upload (HTTP ${xhr.status}).`
          )
        );
        return;
      }

      const secureUrl = body.secure_url;
      const publicId = body.public_id;
      if (typeof secureUrl !== "string" || typeof publicId !== "string") {
        reject(new CloudinaryUploadError("REJECTED", "Cloudinary returned an unexpected response."));
        return;
      }

      resolve({
        secureUrl,
        publicId,
        resourceType: typeof body.resource_type === "string" ? body.resource_type : "image",
        format: typeof body.format === "string" ? body.format : "",
        bytes: typeof body.bytes === "number" ? body.bytes : file.size,
        ...(typeof body.original_filename === "string" ? { originalFilename: body.original_filename } : {}),
        ...(typeof body.width === "number" ? { width: body.width } : {}),
        ...(typeof body.height === "number" ? { height: body.height } : {}),
        ...(typeof body.folder === "string" ? { folder: body.folder } : {}),
      });
    };

    if (options.signal) {
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

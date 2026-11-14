import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { db, getBucket } from "./admin";
import { writeAuditLogDirect } from "./audit";
import { writeNotification } from "./notifications";
import { getCallerClaims, isCatalogManagerRole, requireCatalogManager } from "./roleClaims";
import {
  CLOUDINARY_SECRETS,
  configuredCloudinary,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cloudinaryCloudName,
  MAX_REPORT_BYTES,
  REPORTS_FOLDER,
} from "./cloudinaryConfig";

const DOWNLOAD_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface GetReportDownloadUrlInput {
  reportId: string;
}

// Defense in depth alongside storage.rules / Cloudinary `authenticated`
// delivery: re-checks authorization here too, then issues a short-lived
// signed URL rather than ever exposing a raw storage path or an
// unsigned Cloudinary URL to the client. Every access is audit-logged —
// reports are health data.
//
// Two storage backends are supported on purpose: reports created before
// the Cloudinary migration have a Firebase Storage `filePath` and keep
// working unchanged; new ones carry Cloudinary metadata.
export const getReportDownloadUrl = onCall<GetReportDownloadUrlInput>(
  { secrets: CLOUDINARY_SECRETS },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const { reportId } = request.data ?? {};
    if (typeof reportId !== "string" || !reportId) {
      throw new HttpsError("invalid-argument", "Missing report id.");
    }

    const reportSnap = await db.collection("reports").doc(reportId).get();
    if (!reportSnap.exists) {
      // Same error as an unauthorized read, so this can't be used to
      // probe which report ids exist.
      throw new HttpsError("permission-denied", "Invalid report.");
    }
    const report = reportSnap.data()!;

    const isOwner = report.userId === uid;
    const isStaff = isCatalogManagerRole(getCallerClaims(request).role);
    if (!isOwner && !isStaff) {
      throw new HttpsError("permission-denied", "Invalid report.");
    }

    if (report.status !== "ready") {
      throw new HttpsError("failed-precondition", "This report isn't ready yet.");
    }

    const expiresAt = Date.now() + DOWNLOAD_TTL_MS;
    let url: string;

    if (report.storageProvider === "cloudinary") {
      if (!report.publicId) {
        throw new HttpsError("failed-precondition", "This report has no file attached yet.");
      }
      const cloudinary = configuredCloudinary();
      url = cloudinary.utils.private_download_url(report.publicId as string, (report.format as string) || "pdf", {
        resource_type: (report.resourceType as string) || "raw",
        type: "authenticated",
        expires_at: Math.floor(expiresAt / 1000),
        attachment: true,
      });
    } else {
      if (!report.filePath) {
        throw new HttpsError("failed-precondition", "This report has no file attached yet.");
      }
      [url] = await getBucket()
        .file(report.filePath as string)
        .getSignedUrl({ action: "read", expires: expiresAt });
    }

    await writeAuditLogDirect({
      action: "report.downloaded",
      actorType: isOwner ? "customer" : "staff",
      actorId: uid,
      targetType: "report",
      targetId: reportId,
      metadata: { storageProvider: (report.storageProvider as string) ?? "firebase-storage" },
    });

    return { url, expiresAt: new Date(expiresAt).toISOString() };
  }
);

// ---------- Admin upload flow ----------

interface ReportUploadSignatureInput {
  bookingId: string;
}

// Step 1: staff asks for permission to upload a report file for a
// specific booking. The customer the report will belong to is derived
// from the booking document server-side and encoded into the public_id
// — the client never gets to say whose report this is.
export const getReportUploadSignature = onCall<ReportUploadSignatureInput>(
  { secrets: CLOUDINARY_SECRETS },
  async (request) => {
    requireCatalogManager(request);
    const { bookingId } = request.data ?? {};
    if (typeof bookingId !== "string" || !bookingId) {
      throw new HttpsError("invalid-argument", "Missing booking id.");
    }

    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) throw new HttpsError("not-found", "That booking doesn't exist.");
    const booking = bookingSnap.data()!;

    const cloudinary = configuredCloudinary();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${REPORTS_FOLDER}/${booking.userId}`;
    const publicId = `${folder}/${randomUUID()}`;

    // `type: authenticated` is what makes the stored file unreachable
    // by any plain res.cloudinary.com URL — only the expiring signed
    // download link issued by getReportDownloadUrl can fetch it.
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, public_id: publicId, type: "authenticated" },
      cloudinaryApiSecret.value()
    );

    return {
      cloudName: cloudinaryCloudName.value(),
      apiKey: cloudinaryApiKey.value(),
      timestamp,
      folder,
      publicId,
      signature,
      type: "authenticated",
      resourceType: "raw",
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinaryCloudName.value()}/raw/upload`,
      maxBytes: MAX_REPORT_BYTES,
    };
  }
);

interface ConfirmReportUploadInput {
  publicId: string;
  bookingId: string;
  patientId?: string;
  labId?: string;
  testId?: string;
  packageId?: string;
  filename?: string;
  reportId?: string; // present when REPLACING an existing report's file
}

// Step 2: verify the upload really exists in Cloudinary, then create
// (or replace the file on) the report record. `userId` always comes
// from the booking, never from the request — that single property is
// what keeps customer A's report from ever being filed against
// customer B.
export const confirmReportUpload = onCall<ConfirmReportUploadInput>(
  { secrets: CLOUDINARY_SECRETS },
  async (request) => {
    const { uid } = requireCatalogManager(request);
    const { publicId, bookingId, patientId, labId, testId, packageId, filename, reportId } = request.data ?? {};

    if (typeof publicId !== "string" || typeof bookingId !== "string" || !bookingId) {
      throw new HttpsError("invalid-argument", "Missing report upload details.");
    }

    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) throw new HttpsError("not-found", "That booking doesn't exist.");
    const booking = bookingSnap.data()!;
    const ownerUid = booking.userId as string;

    const expectedPrefix = `${REPORTS_FOLDER}/${ownerUid}/`;
    if (!publicId.startsWith(expectedPrefix)) {
      throw new HttpsError("invalid-argument", "That file doesn't belong to this booking's customer.");
    }

    const cloudinary = configuredCloudinary();
    let resource: Record<string, unknown>;
    try {
      resource = (await cloudinary.api.resource(publicId, {
        resource_type: "raw",
        type: "authenticated",
      })) as unknown as Record<string, unknown>;
    } catch {
      throw new HttpsError("not-found", "That upload wasn't found in Cloudinary.");
    }

    const bytes = (resource.bytes as number) ?? 0;
    if (bytes > MAX_REPORT_BYTES) {
      await cloudinary.uploader.destroy(publicId, { resource_type: "raw", type: "authenticated", invalidate: true });
      throw new HttpsError("invalid-argument", "That file is too large.");
    }

    const fileFields = {
      storageProvider: "cloudinary",
      publicId: resource.public_id as string,
      assetId: (resource.asset_id as string) ?? "",
      resourceType: "raw",
      format: (resource.format as string) || guessFormat(resource.public_id as string, filename),
      bytes,
      filename:
        typeof filename === "string" && filename ? filename.slice(0, 200) : (resource.public_id as string),
      folder: `${REPORTS_FOLDER}/${ownerUid}`,
      uploadedBy: uid,
      uploadedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof reportId === "string" && reportId) {
      const ref = db.collection("reports").doc(reportId);
      const existing = await ref.get();
      if (!existing.exists) throw new HttpsError("not-found", "That report no longer exists.");
      const previous = existing.data()!;
      if (previous.userId !== ownerUid) {
        throw new HttpsError("failed-precondition", "That report belongs to a different customer.");
      }
      await ref.update(fileFields);

      // Replacing a file: clean up the old Cloudinary object so
      // superseded health data doesn't linger.
      if (previous.storageProvider === "cloudinary" && previous.publicId && previous.publicId !== publicId) {
        await cloudinary.uploader
          .destroy(previous.publicId as string, { resource_type: "raw", type: "authenticated", invalidate: true })
          .catch(() => undefined);
      }

      await writeAuditLogDirect({
        action: "report.file_replaced",
        actorType: "staff",
        actorId: uid,
        targetType: "report",
        targetId: reportId,
        metadata: { bookingId, publicId },
      });
      return { reportId };
    }

    const ref = await db.collection("reports").add({
      userId: ownerUid,
      bookingId,
      patientId: typeof patientId === "string" && patientId ? patientId : ((booking.patientId as string) ?? ""),
      labId: typeof labId === "string" && labId ? labId : ((booking.labId as string) ?? ""),
      ...(testId ? { testId } : {}),
      ...(packageId ? { packageId } : {}),
      status: "processing",
      ...fileFields,
      createdAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLogDirect({
      action: "report.created",
      actorType: "staff",
      actorId: uid,
      targetType: "report",
      targetId: ref.id,
      metadata: { bookingId, publicId },
    });

    return { reportId: ref.id };
  }
);

interface SetReportReadyInput {
  reportId: string;
}

// Marking a report ready must also notify the customer, and
// notifications are Admin-SDK-only writes (firestore.rules denies
// client creates), so this has to be a Cloud Function rather than the
// direct Firestore update the admin panel used before.
export const setReportReady = onCall<SetReportReadyInput>(async (request) => {
  const { uid } = requireCatalogManager(request);
  const { reportId } = request.data ?? {};
  if (typeof reportId !== "string" || !reportId) {
    throw new HttpsError("invalid-argument", "Missing report id.");
  }

  const ref = db.collection("reports").doc(reportId);

  const alreadyReady = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That report no longer exists.");
    const report = snap.data()!;

    if (!report.publicId && !report.filePath) {
      throw new HttpsError("failed-precondition", "Attach a report file before marking it ready.");
    }
    if (report.status === "ready") return true;

    tx.update(ref, { status: "ready", updatedBy: uid, updatedAt: FieldValue.serverTimestamp() });
    writeNotification(tx, {
      userId: report.userId as string,
      type: "report_ready",
      title: "Your report is ready",
      message: `Your report for booking ${report.bookingId} is available to download.`,
    });
    return false;
  });

  if (!alreadyReady) {
    await writeAuditLogDirect({
      action: "report.marked_ready",
      actorType: "staff",
      actorId: uid,
      targetType: "report",
      targetId: reportId,
    });
  }

  return { ok: true, alreadyReady };
});

export function guessFormat(publicId: string, filename?: string): string {
  const source = filename || publicId;
  const dot = source.lastIndexOf(".");
  if (dot === -1 || dot === source.length - 1) return "pdf";
  return source.slice(dot + 1).toLowerCase();
}

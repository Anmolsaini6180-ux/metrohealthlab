export type ReportStorageProvider = "firebase-storage" | "cloudinary";

export interface Report {
  id: string;
  userId: string;
  patientId: string;
  bookingId: string;
  testId?: string;
  packageId?: string;
  labId: string;
  status: "processing" | "ready";

  // Which backend holds the file. Reports created before the Cloudinary
  // migration have no value here and use `filePath`; both are served
  // through getReportDownloadUrl, which branches on this field.
  storageProvider?: ReportStorageProvider;

  /** Firebase Storage path — legacy reports only. Never exposed to the client. */
  filePath?: string;

  /** Cloudinary metadata — never a directly usable URL (assets are `authenticated`). */
  publicId?: string;
  assetId?: string;
  resourceType?: string;
  format?: string;
  bytes?: number;
  filename?: string;
  folder?: string;

  uploadedBy?: string;
  uploadedAt?: unknown;
  updatedBy?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type ReportStorageProvider = "firebase-storage" | "cloudinary" | "supabase_storage";

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
  // migration have no value here and use `filePath`; all three are
  // served through getSecureDownloadUrl, which branches on this field.
  storageProvider?: ReportStorageProvider;

  /** Firebase Storage path — legacy reports only. Never exposed to the client. */
  filePath?: string;

  /**
   * Cloudinary metadata (storageProvider = 'cloudinary'): publicId is
   * the Cloudinary public_id.
   * Supabase Storage (storageProvider = 'supabase_storage'): publicId
   * is reused to hold the object path within `bucket` — same column,
   * different meaning per provider, rather than a redundant parallel
   * column (matches media_assets' own object_path convention).
   */
  publicId?: string;
  /** Supabase Storage bucket name — only set when storageProvider = 'supabase_storage'. */
  bucket?: string;
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

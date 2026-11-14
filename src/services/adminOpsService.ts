// Supabase-backed.
//
// getAllPayments always returns [] now: this project is cash-on-home
// only (see paymentService.ts's removal) -- there is no online payment
// gateway, so a "payments" ledger genuinely has nothing to show, ever.
// Returning an honest empty list beats faking a ledger or repurposing
// cash_collections into a shape it was never designed to have.
//
// sendAdminNotification goes through the send_admin_notification RPC:
// `notifications` has no client INSERT policy at all, on purpose, so a
// staff account cannot write into another user's feed directly — the
// scope check has to run server-side, same as the Cloud Function this
// replaces was meant to do (and never was, on Spark).
import { getSupabaseClient } from "@/supabase/client";
import { rowToNotification } from "@/supabase/mappers";
import type { Report } from "@/types/report";
import type { Payment } from "@/types/payment";
import type { AppNotification } from "@/types/notification";

// ---------- Reports (admin, read-only) ----------

export async function getAllReports(bookingId?: string): Promise<Report[]> {
  const base = getSupabaseClient().from("reports").select("*");
  const { data, error } = bookingId
    ? await base.eq("booking_id", bookingId)
    : await base.order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    patientId: r.patient_id ?? "",
    bookingId: r.booking_id ?? "",
    testId: r.test_id ?? undefined,
    packageId: r.package_id ?? undefined,
    labId: r.lab_id ?? "",
    status: r.status,
    storageProvider: r.storage_provider ?? undefined,
    publicId: r.public_id ?? undefined,
    assetId: r.asset_id ?? undefined,
    resourceType: r.resource_type ?? undefined,
    format: r.format ?? undefined,
    bytes: r.bytes ?? undefined,
    filename: r.filename ?? undefined,
    folder: r.folder ?? undefined,
    uploadedBy: r.uploaded_by ?? undefined,
    uploadedAt: r.uploaded_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }) as Report);
}

// ---------- Payments (admin) — cash on home only, no online gateway ----------

export async function getAllPayments(_status?: string): Promise<Payment[]> {
  return [];
}

// ---------- Notifications (admin) ----------

export async function getAllNotifications(): Promise<AppNotification[]> {
  const { data, error } = await getSupabaseClient().from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(rowToNotification);
}

export interface SendNotificationRequest {
  customerUid: string;
  type: "offer" | "system";
  title: string;
  message: string;
}

export async function sendAdminNotification(payload: SendNotificationRequest): Promise<{ ok: true }> {
  const { error } = await getSupabaseClient().rpc("send_admin_notification", {
    p_customer_id: payload.customerUid,
    p_type: payload.type,
    p_title: payload.title,
    p_message: payload.message,
  });
  if (error) throw error;
  return { ok: true };
}

export interface BroadcastNotificationRequest {
  audience: "all" | "selected";
  customerUids?: string[];
  type: "offer" | "system";
  title: string;
  message: string;
  imageUrl?: string;
  actionUrl?: string;
}

/**
 * Fans out to every matching recipient in ONE server-side INSERT ...
 * SELECT (see the send_broadcast_notification RPC) — never a browser
 * loop over customer ids, and never the service-role key. "all" is
 * resolved (and excludes staff) entirely inside the RPC; the browser
 * never even sees the recipient list for that case.
 */
export async function sendBroadcastNotification(
  payload: BroadcastNotificationRequest
): Promise<{ batchId: string; recipientCount: number }> {
  const { data, error } = await getSupabaseClient().rpc("send_broadcast_notification", {
    p_audience: payload.audience,
    p_type: payload.type,
    p_title: payload.title,
    p_message: payload.message,
    p_customer_ids: payload.audience === "selected" ? payload.customerUids ?? [] : null,
    p_image_url: payload.imageUrl ?? null,
    p_action_url: payload.actionUrl ?? null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { out_batch_id: string; out_recipient_count: number };
  return { batchId: row.out_batch_id, recipientCount: row.out_recipient_count };
}

export interface NotificationBatchSummary {
  batchId: string | null;
  title: string;
  message: string;
  type: string;
  imageUrl?: string;
  createdAt: unknown;
  recipientCount: number;
  readCount: number;
}

/**
 * One row per admin-sent notification (grouped by batch_id — every
 * recipient of the same broadcast shares one), rather than the raw
 * per-recipient rows getAllNotifications returns. Automatic
 * booking-lifecycle notifications (sent_by is null) are excluded here;
 * they already have their own home in each booking's own history.
 */
export async function getSentNotificationBatches(): Promise<NotificationBatchSummary[]> {
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .select("id, batch_id, title, message, type, image_url, created_at, read")
    .not("sent_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const byBatch = new Map<string, NotificationBatchSummary>();
  for (const row of data ?? []) {
    const key = (row.batch_id as string | null) ?? (row as { id?: string }).id ?? crypto.randomUUID();
    const existing = byBatch.get(key);
    if (existing) {
      existing.recipientCount += 1;
      if (row.read) existing.readCount += 1;
      continue;
    }
    byBatch.set(key, {
      batchId: row.batch_id as string | null,
      title: row.title as string,
      message: row.message as string,
      type: row.type as string,
      imageUrl: (row.image_url as string) ?? undefined,
      createdAt: row.created_at,
      recipientCount: 1,
      readCount: row.read ? 1 : 0,
    });
  }
  return [...byBatch.values()].sort((a, b) => (String(b.createdAt) > String(a.createdAt) ? 1 : -1));
}

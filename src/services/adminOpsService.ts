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

import { collection, getDocs, orderBy, query, where, limit as fsLimit } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import type { Report } from "@/types/report";
import type { Payment } from "@/types/payment";
import type { AppNotification } from "@/types/notification";

// ---------- Reports (admin) ----------
// READ-ONLY here. Report files are uploaded through the Cloudinary
// signed-upload flow in mediaService.ts (uploadReportFile /
// setReportReady), which is backed by Cloud Functions; firestore.rules
// denies all client writes to `reports`, so creating or mutating a
// report record from this file is no longer possible — and shouldn't
// be, since the customer a report belongs to must be derived from the
// booking server-side rather than typed in by a human.

export async function getAllReports(bookingId?: string): Promise<Report[]> {
  const q = bookingId
    ? query(collection(getDb(), "reports"), where("bookingId", "==", bookingId))
    : query(collection(getDb(), "reports"), orderBy("createdAt", "desc"), fsLimit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report));
}

// ---------- Payments (admin, read-only) ----------
// Never written from the client — createPaymentOrder/the Razorpay
// webhook are the only writers. This is a read-only ledger view.

export async function getAllPayments(status?: string): Promise<Payment[]> {
  const q = status
    ? query(collection(getDb(), "payments"), where("status", "==", status), orderBy("createdAt", "desc"), fsLimit(200))
    : query(collection(getDb(), "payments"), orderBy("createdAt", "desc"), fsLimit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}

// ---------- Notifications (admin) ----------

export async function getAllNotifications(): Promise<AppNotification[]> {
  const q = query(collection(getDb(), "notifications"), orderBy("createdAt", "desc"), fsLimit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
}

export interface SendNotificationRequest {
  customerUid: string;
  type: "offer" | "system";
  title: string;
  message: string;
}

// Hierarchy-scope checked server-side — see functions/src/adminNotifications.ts.
export async function sendAdminNotification(payload: SendNotificationRequest): Promise<{ ok: true }> {
  return callFunction<SendNotificationRequest, { ok: true }>("sendAdminNotification", payload);
}

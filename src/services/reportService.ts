import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import type { Report } from "@/types/report";

const REPORTS = "reports";

export async function getUserReports(userId: string): Promise<Report[]> {
  const q = query(collection(getDb(), REPORTS), where("userId", "==", userId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report));
}

export interface SecureDownloadUrlResponse {
  url: string;
  expiresAt: string;
}

// Reports are never fetched by Storage path directly from the client.
// This calls a Cloud Function that re-checks the caller owns the report
// (defense in depth alongside Storage security rules) and returns a
// short-lived signed URL.
export async function getSecureDownloadUrl(reportId: string): Promise<SecureDownloadUrlResponse> {
  return callFunction<{ reportId: string }, SecureDownloadUrlResponse>("getReportDownloadUrl", {
    reportId,
  });
}

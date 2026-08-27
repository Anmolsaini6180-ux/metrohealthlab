import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();

// Resolved lazily, not at module load. Every deployed function loads
// this module, so an eager getStorage().bucket() meant one missing or
// malformed storageBucket in the runtime config would fail to load the
// ENTIRE deployment — including the payment webhook, which has nothing
// to do with Storage. Only the legacy report-download path touches it,
// so it now fails alone if it fails at all.
export function getBucket() {
  return getStorage().bucket();
}

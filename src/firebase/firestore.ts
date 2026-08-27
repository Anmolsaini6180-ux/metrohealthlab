import { initializeFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseApp } from "./config";

let db: Firestore | null = null;

export function getDb(): Firestore {
  if (!db) {
    // Some mobile browsers/webviews and restrictive mobile networks
    // don't handle Firestore's default streaming transport well, which
    // can make queries hang forever instead of failing with a visible
    // error. Auto-detecting long-polling avoids that.
    db = initializeFirestore(getFirebaseApp(), {
      experimentalAutoDetectLongPolling: true,
    });
  }
  return db;
}

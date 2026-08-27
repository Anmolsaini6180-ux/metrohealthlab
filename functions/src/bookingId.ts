import { db } from "./admin";
import type { Transaction } from "firebase-admin/firestore";

// Generates sequential, human-readable booking IDs like MH26082000001
// (MH + YYMMDD + a 5-digit daily sequence) inside the same transaction
// that creates the booking, so two concurrent bookings can never
// collide. The counter document lives at counters/bookings-{YYMMDD}.
export async function generateBookingId(tx: Transaction, now: Date): Promise<string> {
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dayKey = `${y}${m}${d}`;

  const counterRef = db.collection("counters").doc(`bookings-${dayKey}`);
  const counterSnap = await tx.get(counterRef);
  const next = (counterSnap.exists ? (counterSnap.data()!.count as number) : 0) + 1;
  tx.set(counterRef, { count: next }, { merge: true });

  return `MH${dayKey}${String(next).padStart(5, "0")}`;
}

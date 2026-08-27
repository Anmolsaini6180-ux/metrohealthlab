import { collection, getDocs, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { Slot } from "@/types/slot";

const SLOTS = "slots";

function availableSlotsQuery(areaId: string, date: string, collectionType: "home" | "center") {
  return query(
    collection(getDb(), SLOTS),
    where("areaId", "==", areaId),
    where("date", "==", date),
    where("collectionType", "==", collectionType),
    where("active", "==", true)
  );
}

function withAvailability(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.bookedCount < s.capacity);
}

export async function getAvailableSlots(
  areaId: string,
  date: string,
  collectionType: "home" | "center"
): Promise<Slot[]> {
  const snap = await getDocs(availableSlotsQuery(areaId, date, collectionType));
  const slots = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Slot));
  return withAvailability(slots);
}

// Realtime slot availability so two customers booking the last slot at
// once see capacity update live. Actual overbooking prevention still
// happens server-side in a Firestore transaction inside the booking
// Cloud Function — this listener is for UI freshness only.
export function subscribeToSlots(
  areaId: string,
  date: string,
  collectionType: "home" | "center",
  callback: (slots: Slot[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    availableSlotsQuery(areaId, date, collectionType),
    (snap) => {
      const slots = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Slot));
      callback(withAvailability(slots));
    },
    (err) => onError?.(err)
  );
}

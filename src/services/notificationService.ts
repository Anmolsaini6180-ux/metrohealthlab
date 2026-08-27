import { collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where, writeBatch, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { AppNotification } from "@/types/notification";

const NOTIFICATIONS = "notifications";

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(getDb(), NOTIFICATIONS),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification))),
    (err) => onError?.(err)
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(getDb(), NOTIFICATIONS, notificationId), { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q = query(collection(getDb(), NOTIFICATIONS), where("userId", "==", userId), where("read", "==", false));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

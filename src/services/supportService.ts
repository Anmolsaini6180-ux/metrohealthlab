import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { SupportTicket } from "@/types/support";

const SUPPORT_TICKETS = "supportTickets";

export async function createSupportTicket(
  userId: string,
  data: { subject: string; message: string; bookingId?: string }
): Promise<string> {
  const ref = await addDoc(collection(getDb(), SUPPORT_TICKETS), {
    ...data,
    userId,
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserTickets(userId: string): Promise<SupportTicket[]> {
  const q = query(collection(getDb(), SUPPORT_TICKETS), where("userId", "==", userId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket));
}

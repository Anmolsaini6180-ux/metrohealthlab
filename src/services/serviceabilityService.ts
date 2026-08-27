import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { ServiceArea } from "@/types/serviceArea";

const SERVICE_AREAS = "serviceAreas";

export async function checkServiceability(pincode: string): Promise<ServiceArea | null> {
  const q = query(
    collection(getDb(), SERVICE_AREAS),
    where("pincode", "==", pincode.trim()),
    where("active", "==", true),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as ServiceArea;
}

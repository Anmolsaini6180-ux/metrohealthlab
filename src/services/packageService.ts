import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit as fsLimit, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { HealthPackage } from "@/types/package";

const PACKAGES = "packages";
const DEFAULT_LIST_LIMIT = 200;

export async function getPackages(options?: { category?: string }): Promise<HealthPackage[]> {
  const constraints = [where("active", "==", true), orderBy("displayOrder", "asc")];
  if (options?.category) {
    constraints.unshift(where("category", "==", options.category));
  }
  const q = query(collection(getDb(), PACKAGES), ...constraints, fsLimit(DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthPackage));
}

export async function getPackageBySlug(slug: string): Promise<HealthPackage | null> {
  const q = query(collection(getDb(), PACKAGES), where("slug", "==", slug), where("active", "==", true));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as HealthPackage;
}

export async function getPackageById(id: string): Promise<HealthPackage | null> {
  const snap = await getDoc(doc(getDb(), PACKAGES, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as HealthPackage;
}

export async function searchPackages(queryText: string): Promise<HealthPackage[]> {
  const all = await getPackages();
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  return all.filter((p) => p.name.toLowerCase().includes(q));
}

export function subscribeToPackages(
  options: { category?: string } | undefined,
  callback: (packages: HealthPackage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const constraints = [where("active", "==", true), orderBy("displayOrder", "asc")];
  if (options?.category) {
    constraints.unshift(where("category", "==", options.category));
  }
  const q = query(collection(getDb(), PACKAGES), ...constraints, fsLimit(DEFAULT_LIST_LIMIT));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthPackage))),
    (err) => onError?.(err)
  );
}

import { collection, doc, getDoc, getDocs, onSnapshot, query, where, limit as fsLimit, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { Lab, LabPricing } from "@/types/lab";

const LABS = "labs";
const LAB_PRICING = "labPricing";
const DEFAULT_LIST_LIMIT = 200;

export async function getActiveLabs(): Promise<Lab[]> {
  const q = query(collection(getDb(), LABS), where("active", "==", true), fsLimit(DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lab));
}

export async function getLabById(id: string): Promise<Lab | null> {
  const snap = await getDoc(doc(getDb(), LABS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Lab;
}

export function subscribeToActiveLabs(
  callback: (labs: Lab[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), LABS), where("active", "==", true), fsLimit(DEFAULT_LIST_LIMIT));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lab))),
    (err) => onError?.(err)
  );
}

export async function getLabPricingForTest(testId: string): Promise<LabPricing[]> {
  const q = query(collection(getDb(), LAB_PRICING), where("testId", "==", testId), where("active", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LabPricing));
}

export async function getLabPricingForPackage(packageId: string): Promise<LabPricing[]> {
  const q = query(collection(getDb(), LAB_PRICING), where("packageId", "==", packageId), where("active", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LabPricing));
}

// Realtime variants — used specifically on the test/package DETAIL
// pages, where a customer is actively deciding whether to book and an
// admin price change is genuinely useful to see live. Deliberately not
// used on list/browse pages (Home, Tests, Packages, Labs): per "avoid
// excessive listener usage," a customer scrolling a catalog list isn't
// mid-decision the way someone on a single item's detail page is, and
// those list pages already refetch on every navigation, so a price
// change is visible within one interaction regardless.
export function subscribeToLabPricingForTest(
  testId: string,
  callback: (pricing: LabPricing[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), LAB_PRICING), where("testId", "==", testId), where("active", "==", true));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LabPricing))),
    (err) => onError?.(err)
  );
}

export function subscribeToLabPricingForPackage(
  packageId: string,
  callback: (pricing: LabPricing[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), LAB_PRICING), where("packageId", "==", packageId), where("active", "==", true));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LabPricing))),
    (err) => onError?.(err)
  );
}

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as fsLimit,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { DiagnosticTest, TestCategory } from "@/types/test";

const TESTS = "tests";
const TEST_CATEGORIES = "testCategories";
const DEFAULT_LIST_LIMIT = 200; // defensive cap — see searchTests for why this also bounds catalog-wide search

export async function getTests(options?: { categoryId?: string; max?: number }): Promise<DiagnosticTest[]> {
  const constraints = [where("active", "==", true), orderBy("displayOrder", "asc")];
  if (options?.categoryId) {
    constraints.unshift(where("categoryId", "==", options.categoryId));
  }
  const q = query(collection(getDb(), TESTS), ...constraints, fsLimit(options?.max ?? DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiagnosticTest));
}

export async function getTestBySlug(slug: string): Promise<DiagnosticTest | null> {
  const q = query(collection(getDb(), TESTS), where("slug", "==", slug), where("active", "==", true));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as DiagnosticTest;
}

export async function getTestById(id: string): Promise<DiagnosticTest | null> {
  const snap = await getDoc(doc(getDb(), TESTS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DiagnosticTest;
}

export async function getTestCategories(): Promise<TestCategory[]> {
  const q = query(collection(getDb(), TEST_CATEGORIES), where("active", "==", true), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TestCategory));
}

// Client-side substring search over the active test set. This is fine for
// a catalog of a few hundred tests; if the catalog grows, replace the
// body of this function with a call to a hosted search service (e.g.
// Algolia/Typesense) — keep the function signature the same so callers
// don't need to change.
export async function searchTests(queryText: string): Promise<DiagnosticTest[]> {
  const all = await getTests();
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  return all.filter(
    (t) => t.name.toLowerCase().includes(q) || t.shortName?.toLowerCase().includes(q)
  );
}

// Realtime variants — used on the customer-facing browse pages (Home,
// Tests, Health Concerns) so an admin's catalog change (price, active
// status, a new test, a new category) appears live, with no refresh.
export function subscribeToTests(
  options: { categoryId?: string; max?: number } | undefined,
  callback: (tests: DiagnosticTest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const constraints = [where("active", "==", true), orderBy("displayOrder", "asc")];
  if (options?.categoryId) {
    constraints.unshift(where("categoryId", "==", options.categoryId));
  }
  const q = query(collection(getDb(), TESTS), ...constraints, fsLimit(options?.max ?? DEFAULT_LIST_LIMIT));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiagnosticTest))),
    (err) => onError?.(err)
  );
}

export function subscribeToTestCategories(
  callback: (categories: TestCategory[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), TEST_CATEGORIES), where("active", "==", true), orderBy("displayOrder", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TestCategory))),
    (err) => onError?.(err)
  );
}

// Single query across up to 30 category IDs at once (Firestore's `in`
// operator limit) instead of one query per category — used by
// RadiologyPage, which previously ran N parallel one-time fetches (one
// per matched category) and combined them client-side.
export function subscribeToTestsByCategoryIds(
  categoryIds: string[],
  callback: (tests: DiagnosticTest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (categoryIds.length === 0) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(getDb(), TESTS),
    where("categoryId", "in", categoryIds.slice(0, 30)),
    where("active", "==", true),
    fsLimit(DEFAULT_LIST_LIMIT)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiagnosticTest))),
    (err) => onError?.(err)
  );
}

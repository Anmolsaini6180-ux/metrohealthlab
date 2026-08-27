import { collection, getDocs, limit as fsLimit, onSnapshot, orderBy, query, where, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { Article, Banner, Faq, Offer } from "@/types/content";

const DEFAULT_LIST_LIMIT = 200;

export async function getBanners(): Promise<Banner[]> {
  const q = query(collection(getDb(), "banners"), where("active", "==", true), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Banner));
}

export function subscribeToBanners(callback: (banners: Banner[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const q = query(collection(getDb(), "banners"), where("active", "==", true), orderBy("displayOrder", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Banner))),
    (err) => onError?.(err)
  );
}

export async function getOffers(): Promise<Offer[]> {
  const q = query(collection(getDb(), "offers"), where("active", "==", true), fsLimit(DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer));
}

export function subscribeToOffers(callback: (offers: Offer[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const q = query(collection(getDb(), "offers"), where("active", "==", true), fsLimit(DEFAULT_LIST_LIMIT));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer))),
    (err) => onError?.(err)
  );
}

export async function getArticles(options?: { categoryId?: string }): Promise<Article[]> {
  const constraints = [where("active", "==", true), orderBy("publishedAt", "desc")];
  if (options?.categoryId) constraints.unshift(where("categoryId", "==", options.categoryId));
  const q = query(collection(getDb(), "articles"), ...constraints, fsLimit(DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Article));
}

export function subscribeToArticles(
  options: { categoryId?: string } | undefined,
  callback: (articles: Article[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const constraints = [where("active", "==", true), orderBy("publishedAt", "desc")];
  if (options?.categoryId) constraints.unshift(where("categoryId", "==", options.categoryId));
  const q = query(collection(getDb(), "articles"), ...constraints, fsLimit(DEFAULT_LIST_LIMIT));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Article))),
    (err) => onError?.(err)
  );
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const q = query(collection(getDb(), "articles"), where("slug", "==", slug), where("active", "==", true));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Article;
}

// Realtime — a customer sitting on an article's own page benefits from
// a live content edit the same way test/package detail pages do.
export function subscribeToArticleBySlug(
  slug: string,
  callback: (article: Article | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(getDb(), "articles"), where("slug", "==", slug), where("active", "==", true));
  return onSnapshot(
    q,
    (snap) => callback(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Article)),
    (err) => onError?.(err)
  );
}

export async function getFaqs(topic?: string): Promise<Faq[]> {
  const constraints = topic ? [where("topic", "==", topic)] : [];
  const q = query(collection(getDb(), "faqs"), ...constraints, orderBy("displayOrder", "asc"), fsLimit(DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Faq));
}

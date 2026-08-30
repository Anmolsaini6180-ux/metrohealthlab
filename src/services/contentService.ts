// Supabase-backed for everything actually used. getFaqs() is left on
// Firestore deliberately — it has zero callers anywhere in the app
// (confirmed by the Phase F audit), so it is not worth porting; a real
// caller appearing later is the trigger to migrate it, not before.
import { collection, getDocs, limit as fsLimit, orderBy, query, where } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { rowToArticle, rowToBanner, rowToOffer } from "@/supabase/mappers";
import type { Article, Banner, Faq, Offer } from "@/types/content";

const DEFAULT_LIST_LIMIT = 200;
type Unsubscribe = () => void;

export async function getBanners(): Promise<Banner[]> {
  const { data, error } = await getSupabaseClient().from("banners").select("*").eq("active", true).order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToBanner);
}

export function subscribeToBanners(callback: (banners: Banner[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const refetch = () => getBanners().then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient().channel("banners-active").on("postgres_changes", { event: "*", schema: "public", table: "banners" }, refetch).subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
}

export async function getOffers(): Promise<Offer[]> {
  const { data, error } = await getSupabaseClient().from("offers").select("*").eq("active", true).limit(DEFAULT_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToOffer);
}

export function subscribeToOffers(callback: (offers: Offer[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const refetch = () => getOffers().then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient().channel("offers-active").on("postgres_changes", { event: "*", schema: "public", table: "offers" }, refetch).subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
}

export async function getArticles(options?: { categoryId?: string }): Promise<Article[]> {
  let q = getSupabaseClient().from("articles").select("*").eq("active", true).order("published_at", { ascending: false }).limit(DEFAULT_LIST_LIMIT);
  if (options?.categoryId) q = q.eq("category", options.categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToArticle);
}

export function subscribeToArticles(
  options: { categoryId?: string } | undefined,
  callback: (articles: Article[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getArticles(options).then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`articles-${options?.categoryId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "articles" }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const { data, error } = await getSupabaseClient().from("articles").select("*").eq("slug", slug).eq("active", true).maybeSingle();
  if (error) throw error;
  return data ? rowToArticle(data) : null;
}

// Realtime — a customer sitting on an article's own page benefits from
// a live content edit the same way test/package detail pages do.
export function subscribeToArticleBySlug(
  slug: string,
  callback: (article: Article | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getArticleBySlug(slug).then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`article-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "articles", filter: `slug=eq.${slug}` }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
}

// Unused — see header comment. Left on Firestore intentionally.
export async function getFaqs(topic?: string): Promise<Faq[]> {
  const constraints = topic ? [where("topic", "==", topic)] : [];
  const q = query(collection(getDb(), "faqs"), ...constraints, orderBy("displayOrder", "asc"), fsLimit(DEFAULT_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Faq));
}

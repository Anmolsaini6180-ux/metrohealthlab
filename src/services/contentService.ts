// Supabase-backed.
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
import { rowToArticle, rowToBanner, rowToOffer } from "@/supabase/mappers";
import type { Article, Banner, Offer } from "@/types/content";

const DEFAULT_LIST_LIMIT = 200;
type Unsubscribe = () => void;

// Real, confirmed root cause of "the homepage banner doesn't show the
// image I configured": this query filtered only on `active`, never on
// the admin form's own start_at/end_at date-range fields — so EVERY
// active banner showed regardless of its scheduled window, while a
// banner outside its window (not yet started, or already ended) would
// have kept showing forever with no way to tell it apart from one that
// hadn't. Dates are plain "YYYY-MM-DD" (see AdminBannersPage's date
// inputs), compared as calendar days in the viewer's own timezone —
// same inclusive-end-of-day convention as isOfferLive() in
// offerWindow.ts, so a banner set to end "today" is still live for the
// whole of today on both features alike.
export function isBannerLive(b: Pick<Banner, "startAt" | "endAt">, now: Date = new Date()): boolean {
  const at = now.getTime();
  if (b.startAt) {
    const from = new Date(`${b.startAt}T00:00:00`).getTime();
    if (!Number.isNaN(from) && at < from) return false;
  }
  if (b.endAt) {
    const to = new Date(`${b.endAt}T23:59:59.999`).getTime();
    if (!Number.isNaN(to) && at > to) return false;
  }
  return true;
}

export async function getBanners(): Promise<Banner[]> {
  const { data, error } = await getSupabaseClient().from("banners").select("*").eq("active", true).order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToBanner).filter((b) => isBannerLive(b));
}

export function subscribeToBanners(callback: (banners: Banner[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const refetch = () => getBanners().then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges("banners-active", { event: "*", schema: "public", table: "banners" }, refetch, onError);
}

export async function getOffers(): Promise<Offer[]> {
  const { data, error } = await getSupabaseClient().from("offers").select("*").eq("active", true).limit(DEFAULT_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToOffer);
}

export function subscribeToOffers(callback: (offers: Offer[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const refetch = () => getOffers().then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges("offers-active", { event: "*", schema: "public", table: "offers" }, refetch, onError);
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
  return subscribeToTableChanges(
    `articles-${options?.categoryId ?? "all"}`,
    { event: "*", schema: "public", table: "articles" },
    refetch,
    onError
  );
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
  return subscribeToTableChanges(
    `article-${slug}`,
    { event: "*", schema: "public", table: "articles", filter: `slug=eq.${slug}` },
    refetch,
    onError
  );
}

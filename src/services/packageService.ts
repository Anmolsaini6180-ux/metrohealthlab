// Supabase-backed. Same exported shapes as the Firestore version — see
// testService.ts's header comment for the pattern this follows.
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { rowToPackage } from "@/supabase/mappers";
import type { HealthPackage } from "@/types/package";

const DEFAULT_LIST_LIMIT = 200;
type Unsubscribe = () => void;

export async function getPackages(options?: { category?: string }): Promise<HealthPackage[]> {
  let q = getSupabaseClient()
    .from("packages")
    .select("*")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .limit(DEFAULT_LIST_LIMIT);
  if (options?.category) q = q.eq("category", options.category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToPackage);
}

export async function getPackageBySlug(slug: string): Promise<HealthPackage | null> {
  const { data, error } = await getSupabaseClient()
    .from("packages")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPackage(data) : null;
}

export async function getPackageById(id: string): Promise<HealthPackage | null> {
  const { data, error } = await getSupabaseClient().from("packages").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToPackage(data) : null;
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
  const refetch = () => getPackages(options).then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel(`packages-${options?.category ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "packages" }, refetch)
      .subscribe();
    return () => {
      getSupabaseClient().removeChannel(channel);
    };
  }, onError);
}

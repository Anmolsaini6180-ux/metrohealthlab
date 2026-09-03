// Supabase-backed. Same exported shapes as the Firestore version — see
// testService.ts's header comment for the pattern this follows.
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { rowToPackage } from "@/supabase/mappers";
import type { HealthPackage } from "@/types/package";

const DEFAULT_LIST_LIMIT = 200;
const PACKAGE_SELECT = "*, package_tests(test_id)";
type Unsubscribe = () => void;

// package_tests is a junction table (package_id, test_id) — rowToPackage
// itself always sets testIds: [] (it has no way to know the join
// result), so every caller here fills it in from the embedded
// package_tests rows. Missing this was a real bug: every customer-
// facing package card/detail page showed "0 Tests" regardless of how
// many tests a package actually had, because only the admin catalogue
// service performed this join.
function toPackageWithTests(row: Record<string, unknown>): HealthPackage {
  const pkg = rowToPackage(row);
  pkg.testIds = ((row.package_tests as { test_id: string }[] | undefined) ?? []).map((t) => t.test_id);
  return pkg;
}

export async function getPackages(options?: { category?: string }): Promise<HealthPackage[]> {
  let q = getSupabaseClient()
    .from("packages")
    .select(PACKAGE_SELECT)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .limit(DEFAULT_LIST_LIMIT);
  if (options?.category) q = q.eq("category", options.category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toPackageWithTests);
}

export async function getPackageBySlug(slug: string): Promise<HealthPackage | null> {
  const { data, error } = await getSupabaseClient()
    .from("packages")
    .select(PACKAGE_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data ? toPackageWithTests(data) : null;
}

export async function getPackageById(id: string): Promise<HealthPackage | null> {
  const { data, error } = await getSupabaseClient().from("packages").select(PACKAGE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPackageWithTests(data) : null;
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

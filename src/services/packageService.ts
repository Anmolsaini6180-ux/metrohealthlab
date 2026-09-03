// Supabase-backed. Same exported shapes as the Firestore version — see
// testService.ts's header comment for the pattern this follows.
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { rowToPackage } from "@/supabase/mappers";
import type { HealthPackage } from "@/types/package";

const DEFAULT_LIST_LIMIT = 200;
// packages_public (not the packages table — see below) already embeds
// the joined test ids as a plain jsonb column of its own, so this is
// just "every column of the view", not a PostgREST relationship embed.
const PACKAGE_SELECT = "*";
type Unsubscribe = () => void;

// Customer-facing reads go through packages_public, a view with the
// exact same active-package rows minus one column: tp (internal cost).
// That's a hard boundary, not a display choice — see the migration
// that created it. It also does its own package_tests aggregation
// (as a jsonb array literally shaped like {test_id}[]) because
// PostgREST's relationship embedding is resolved from real foreign
// keys, which a view's underlying query doesn't expose the same way a
// base table's would.
//
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
    .from("packages_public")
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
    .from("packages_public")
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

// HONEST LIMITATION, introduced by the tp migration: Realtime's
// postgres_changes only exists on real tables, and Supabase Realtime
// filters *whether an event is delivered at all* by the subscriber's
// own row-level SELECT policy on that table — not by the columns the
// query asks for. Customers no longer have SELECT on the base
// `packages` table (see packages_staff_read), so this channel now
// receives zero events for them; it was never safe to "fix" by
// broadcasting from the base table instead, because postgres_changes
// payloads carry the FULL changed row, tp included, straight to every
// open subscriber regardless of column-level grants — the exact leak
// this whole migration exists to close. The initial refetch() below
// still runs and still shows real data; only the "then update live if
// an admin edits something" behaviour is gone for customers now.
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

// Supabase-backed. Every exported function keeps its exact old
// signature and return shape (DiagnosticTest/TestCategory, camelCase)
// so no page or component needed to change — only where the data comes
// from changed. See src/supabase/mappers.ts for the snake_case ->
// camelCase translation shared by every catalogue service.
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
import { rowToTest, rowToTestCategory } from "@/supabase/mappers";
import type { DiagnosticTest, TestCategory } from "@/types/test";

const DEFAULT_LIST_LIMIT = 200;

export async function getTests(options?: { categoryId?: string; max?: number }): Promise<DiagnosticTest[]> {
  let q = getSupabaseClient()
    .from("tests_public")
    .select("*")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .limit(options?.max ?? DEFAULT_LIST_LIMIT);
  if (options?.categoryId) q = q.eq("category_id", options.categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToTest);
}

export async function getTestBySlug(slug: string): Promise<DiagnosticTest | null> {
  const { data, error } = await getSupabaseClient()
    .from("tests_public")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTest(data) : null;
}

export async function getTestById(id: string): Promise<DiagnosticTest | null> {
  const { data, error } = await getSupabaseClient().from("tests_public").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToTest(data) : null;
}

export async function getTestCategories(): Promise<TestCategory[]> {
  const { data, error } = await getSupabaseClient()
    .from("test_categories")
    .select("*")
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToTestCategory);
}

// Client-side substring search over the active test set — unchanged
// behaviour and unchanged comment from the Firestore version: fine for
// a catalog this size; swap for a hosted search service if it grows.
export async function searchTests(queryText: string): Promise<DiagnosticTest[]> {
  const all = await getTests();
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  return all.filter((t) => t.name.toLowerCase().includes(q) || t.shortName?.toLowerCase().includes(q));
}

/** Common cleanup shape returned by every subscribe* below. */
type Unsubscribe = () => void;

// Realtime variants — used on the customer-facing browse pages so an
// admin's catalog change appears live, no refresh. Supabase Realtime
// only pushes row-level CHANGE events, not query results, so each
// subscription re-runs the equivalent SELECT on every change rather
// than patching a single row in place — simplest correct behaviour,
// and these lists are small (a few hundred rows at most).
// HONEST LIMITATION, introduced by the tp migration: customers no
// longer have SELECT on the base `tests` table (see tests_staff_read),
// and Supabase Realtime's postgres_changes gates event DELIVERY on
// that same row-level policy — not on which columns a query asked
// for — so this channel now receives zero events for customers. That
// is deliberate, not a bug: postgres_changes payloads carry the full
// changed row straight to every subscriber regardless of column
// grants, so broadcasting from the base table would hand every open
// customer session tp the moment any test changed — the exact leak
// this migration exists to prevent. The initial refetch() below still
// runs with real data; only later live updates are gone for customers.
export function subscribeToTests(
  options: { categoryId?: string; max?: number } | undefined,
  callback: (tests: DiagnosticTest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getTests(options).then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges(
    `tests-${options?.categoryId ?? "all"}`,
    { event: "*", schema: "public", table: "tests" },
    refetch,
    onError
  );
}

export function subscribeToTestCategories(
  callback: (categories: TestCategory[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getTestCategories().then(callback).catch((err) => onError?.(err));
  refetch();
  return subscribeToTableChanges("test-categories-all", { event: "*", schema: "public", table: "test_categories" }, refetch, onError);
}

// Single query across up to 30 category IDs at once — same limit and
// same reasoning as the Firestore version's own comment (Firestore's
// `in` cap; kept for parity even though Postgres' `in` has no such
// limit, so RadiologyPage's calling convention never needs to change).
// Same tp-migration realtime limitation as subscribeToTests above —
// this channel goes quietly inert for customers now, by design.
export function subscribeToTestsByCategoryIds(
  categoryIds: string[],
  callback: (tests: DiagnosticTest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (categoryIds.length === 0) {
    callback([]);
    return () => {};
  }
  const ids = categoryIds.slice(0, 30);
  const refetch = async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("tests_public")
        .select("*")
        .in("category_id", ids)
        .eq("active", true)
        .limit(DEFAULT_LIST_LIMIT);
      if (error) throw error;
      callback((data ?? []).map(rowToTest));
    } catch (err) {
      onError?.(err as Error);
    }
  };
  refetch();
  return subscribeToTableChanges(
    `tests-by-categories-${ids.join(",")}`,
    { event: "*", schema: "public", table: "tests" },
    refetch,
    onError
  );
}

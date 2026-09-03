import { describe, expect, it, vi } from "vitest";

// Regression test: getPackages/getPackageBySlug/getPackageById used to
// select("*") with no package_tests join, so testIds was always []
// (rowToPackage has no other way to know it) and every customer-facing
// package card/detail page showed "0 Tests" regardless of the real
// count — confirmed live on the homepage showcase before this fix.
const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  lastSelect: "" as string,
  lastTable: "" as string,
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      state.lastTable = table;
      return {
        select: (columns: string) => {
          state.lastSelect = columns;
          const builder = {
            eq: () => builder,
            order: () => builder,
            limit: async () => ({ data: state.row ? [state.row] : [], error: null }),
            maybeSingle: async () => ({ data: state.row, error: null }),
          };
          return builder;
        },
      };
    },
  }),
  safeSubscribe: (setup: () => () => void) => setup(),
}));

const { getPackageBySlug, getPackageById } = await import("@/services/packageService");

const BASE_ROW = {
  id: "pkg-1",
  name: "Complete Thyroid Package",
  slug: "complete-thyroid-package",
  category: "Thyroid",
  description: "",
  mrp: 998,
  selling_price: 499,
  report_tat: "24 hours",
  home_collection: true,
  active: true,
  display_order: 0,
  package_tests: [{ test_id: "test-thyroid-profile" }],
};

describe("packageService test-count join", () => {
  // packages_public is a VIEW with no tp column at all (see the tp/
  // margin migration) — it does its OWN package_tests aggregation as a
  // plain jsonb column, since PostgREST resource embedding is resolved
  // from real foreign keys a view doesn't expose the same way a base
  // table does. So the customer-facing read must target that view
  // (never the base `packages` table, which no longer grants customers
  // any SELECT at all) and can just ask for "*" — the join is already
  // baked into the view's own query, not requested by the client.
  it("reads from packages_public, never the base packages table", async () => {
    state.row = BASE_ROW;
    await getPackageBySlug("complete-thyroid-package");
    expect(state.lastTable).toBe("packages_public");
    expect(state.lastSelect).toBe("*");
  });

  it("populates testIds from the embedded package_tests rows (getPackageBySlug)", async () => {
    state.row = BASE_ROW;
    const pkg = await getPackageBySlug("complete-thyroid-package");
    expect(pkg?.testIds).toEqual(["test-thyroid-profile"]);
  });

  it("populates testIds from the embedded package_tests rows (getPackageById)", async () => {
    state.row = BASE_ROW;
    const pkg = await getPackageById("pkg-1");
    expect(pkg?.testIds).toEqual(["test-thyroid-profile"]);
  });

  it("returns an empty testIds array, never undefined, when a package has no linked tests yet", async () => {
    state.row = { ...BASE_ROW, package_tests: [] };
    const pkg = await getPackageBySlug("complete-thyroid-package");
    expect(pkg?.testIds).toEqual([]);
  });
});

describe("packageService tp exposure", () => {
  // packages_public genuinely has no tp column (see the migration), so
  // a real query against it can never return one — this row models
  // that faithfully rather than asserting against a UI choice. If a
  // future edit ever changes PACKAGE_SELECT or the queried table back
  // toward the base `packages` table, rowToPackage's `"tp" in r` guard
  // means a row that DOES carry tp would flip this from undefined to a
  // real number, and this test would catch that regression.
  it("never carries tp on a customer-facing read", async () => {
    state.row = BASE_ROW;
    const pkg = await getPackageBySlug("complete-thyroid-package");
    expect(pkg?.tp).toBeUndefined();
    expect(JSON.stringify(pkg)).not.toContain("tp");
  });
});

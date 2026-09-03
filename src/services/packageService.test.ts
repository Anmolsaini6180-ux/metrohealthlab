import { describe, expect, it, vi } from "vitest";

// Regression test: getPackages/getPackageBySlug/getPackageById used to
// select("*") with no package_tests join, so testIds was always []
// (rowToPackage has no other way to know it) and every customer-facing
// package card/detail page showed "0 Tests" regardless of the real
// count — confirmed live on the homepage showcase before this fix.
const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  lastSelect: "" as string,
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
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
    }),
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
  it("requests the package_tests embed on every read", async () => {
    state.row = BASE_ROW;
    await getPackageBySlug("complete-thyroid-package");
    expect(state.lastSelect).toContain("package_tests(test_id)");
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

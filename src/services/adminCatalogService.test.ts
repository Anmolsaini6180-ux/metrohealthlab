import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the Supabase query-builder shape: .insert()/.update() capture
// exactly what createTestCategory/updateTestCategory tried to write, so
// assertions can inspect the row without a live database. Unlike the
// Firestore version this replaces, a nullable Postgres column has no
// "omit the key" state on INSERT — every column is present, set to
// either a value or null — so createTestCategory's optional fields are
// asserted as null, not absent. UPDATE still only includes keys the
// caller actually touched (see the `if (input.x !== undefined)` guards
// in adminCatalogService.ts), so that half of the original contract is
// unchanged.
const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  // createPackage/updatePackage also replace package_tests rows (see
  // replacePackageTests) — tracked separately so lastInsert()/
  // lastUpdate() keep meaning "the packages/categories row itself" for
  // every existing test in this file, not whichever table happened to
  // be written to last.
  packageTestsInserts: [] as Record<string, unknown>[][],
}));

vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "package_tests") {
        return {
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async (rows: Record<string, unknown>[]) => {
            state.packageTestsInserts.push(rows);
            return { error: null };
          },
        };
      }
      return {
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "generated-id" }, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          state.updates.push(row);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  }),
}));

const { createTestCategory, updateTestCategory, createPackage, updatePackage } = await import("@/services/adminCatalogService");

const ACTOR = "admin-firebase-uid-1";
const lastInsert = () => state.inserts[state.inserts.length - 1];
const lastUpdate = () => state.updates[state.updates.length - 1];

beforeEach(() => {
  state.inserts.length = 0;
  state.updates.length = 0;
  state.packageTestsInserts.length = 0;
});

describe("createTestCategory", () => {
  it("writes icon as null when no icon was chosen", async () => {
    await createTestCategory(ACTOR, {
      name: "Blood Tests",
      slug: "blood-tests",
      subtitle: "Up to 70% off",
      icon: "",
      active: true,
      displayOrder: 0,
    });

    const row = lastInsert();
    // id is a fresh crypto.randomUUID() per call — see the real bug
    // this locks in below (test_categories.id has no DB default; the
    // insert must set one itself or every create fails with 23502).
    expect(row.id).toEqual(expect.any(String));
    expect(row).toEqual({
      id: row.id,
      name: "Blood Tests",
      slug: "blood-tests",
      subtitle: "Up to 70% off",
      icon: null,
      active: true,
      display_order: 0,
      updated_by_firebase_uid: ACTOR,
    });
  });

  it("sets an explicit id, since test_categories.id has no database default", async () => {
    await createTestCategory(ACTOR, {
      name: "Blood Tests",
      slug: "blood-tests",
      active: true,
    });
    const row = lastInsert();
    expect(typeof row.id).toBe("string");
    expect((row.id as string).length).toBeGreaterThan(10);
  });

  it("writes the ligature name when an icon was chosen", async () => {
    await createTestCategory(ACTOR, {
      name: "Blood Tests",
      slug: "blood-tests",
      subtitle: "Up to 70% off",
      icon: "bloodtype",
      active: true,
      displayOrder: 0,
    });

    expect(lastInsert().icon).toBe("bloodtype");
  });

  it("trims name and slug, and defaults displayOrder/subtitle/icon", async () => {
    await createTestCategory(ACTOR, { name: " Radiology ", slug: " radiology ", active: true });

    const row = lastInsert();
    expect(row.name).toBe("Radiology");
    expect(row.slug).toBe("radiology");
    expect(row.display_order).toBe(0);
    expect(row.subtitle).toBeNull();
    expect(row.icon).toBeNull();
  });
});

describe("updateTestCategory", () => {
  it("changes the icon to another ligature", async () => {
    await updateTestCategory(ACTOR, "cat-1", { name: "Blood Tests", slug: "blood-tests", icon: "biotech" });
    expect(lastUpdate().icon).toBe("biotech");
  });

  it("clears the icon by writing null rather than an empty string", async () => {
    await updateTestCategory(ACTOR, "cat-1", { name: "Blood Tests", slug: "blood-tests", icon: "" });
    expect(lastUpdate().icon).toBeNull();
  });

  it("leaves the stored icon alone when the field is not part of the patch", async () => {
    await updateTestCategory(ACTOR, "cat-1", { active: false });

    const row = lastUpdate();
    expect(row.active).toBe(false);
    expect("icon" in row).toBe(false);
    expect("name" in row).toBe(false);
  });

  it("always attributes the write to the calling admin (RLS requires can_manage_catalog(), this is provenance)", async () => {
    await updateTestCategory(ACTOR, "cat-1", { subtitle: "Flat 20% off" });
    expect(lastUpdate().updated_by_firebase_uid).toBe(ACTOR);
  });
});

// The customer-facing "X Tests" override — replaces the old "type
// comma-separated test ids" field. NULL means "no override, show the
// real linked-tests count" (see utils/packageDisplay.ts), so it must
// round-trip as a real null on create, not be silently dropped.
const PACKAGE_BASE = {
  name: "Full Body Checkup",
  slug: "full-body-checkup",
  category: "Full Body",
  description: "",
  testIds: ["test-1", "test-2"],
  mrp: 999,
  sellingPrice: 799,
  reportTat: "24 hours",
  homeCollection: true,
  labIds: [] as string[],
  active: true,
  tp: null,
};

describe("createPackage", () => {
  it("writes test_count_override as null when no override was entered", async () => {
    await createPackage(ACTOR, { ...PACKAGE_BASE, testCountOverride: null });
    expect(lastInsert().test_count_override).toBeNull();
  });

  it("writes a real override figure when the admin sets one", async () => {
    await createPackage(ACTOR, { ...PACKAGE_BASE, testCountOverride: 70 });
    expect(lastInsert().test_count_override).toBe(70);
  });
});

describe("updatePackage", () => {
  it("sets an override when provided, and leaves it untouched otherwise", async () => {
    await updatePackage(ACTOR, "pkg-1", { testCountOverride: 12 });
    expect(lastUpdate().test_count_override).toBe(12);

    await updatePackage(ACTOR, "pkg-1", { name: "Renamed Package" });
    expect("test_count_override" in lastUpdate()).toBe(false);
  });

  it("clears an override by writing null when the admin blanks the field", async () => {
    await updatePackage(ACTOR, "pkg-1", { testCountOverride: null });
    expect(lastUpdate().test_count_override).toBeNull();
  });
});

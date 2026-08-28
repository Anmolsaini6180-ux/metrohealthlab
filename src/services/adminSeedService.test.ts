import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedStarterCatalog } from "@/services/adminSeedService";

const fs = vi.hoisted(() => {
  class FakeFieldValue {
    constructor(readonly kind: string) {}
  }
  return {
    SERVER_TS: new FakeFieldValue("serverTimestamp"),
    /** Every batch.set() the importer performed: path + id + payload. */
    writes: [] as { path: string; id: string; data: Record<string, unknown> }[],
    commits: 0,
    /** Doc ids the fake database already contains, keyed by collection. */
    existing: new Map<string, string[]>(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (_db: unknown, path: string, id: string) => ({ __path: path, __id: id }),
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  getDocs: async (q: { __path: string }) => {
    const ids = fs.existing.get(q.__path) ?? [];
    return { size: ids.length, docs: ids.map((id) => ({ id })) };
  },
  // The importer only uses these to build a query object; the fake
  // getDocs above keys off the collection path alone.
  query: (base: { __path: string }) => base,
  where: () => ({}),
  limit: () => ({}),
  serverTimestamp: () => fs.SERVER_TS,
  writeBatch: () => ({
    set: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => {
      fs.writes.push({ path: ref.__path, id: ref.__id, data });
    },
    commit: async () => {
      fs.commits++;
    },
  }),
}));

vi.mock("@/firebase/firestore", () => ({ getDb: () => ({}) }));

const ACTOR = "super-admin-uid";

beforeEach(() => {
  fs.writes.length = 0;
  fs.commits = 0;
  fs.existing.clear();
});

describe("seedStarterCatalog on an empty project", () => {
  it("imports every catalog collection", async () => {
    const result = await seedStarterCatalog(ACTOR);

    expect(result.ok).toBe(true);
    expect(result.categoriesCreated).toBeGreaterThan(0);
    expect(result.labsCreated).toBeGreaterThan(0);
    expect(result.testsCreated).toBeGreaterThan(0);
    expect(result.packagesCreated).toBeGreaterThan(0);
    expect(result.labPricingCreated).toBeGreaterThan(0);
    expect(result.serviceAreasCreated).toBeGreaterThan(0);
    expect(result.slotsCreated).toBeGreaterThan(0);
    expect(result.skippedExisting).toBe(0);

    const paths = new Set(fs.writes.map((w) => w.path));
    for (const p of [
      "testCategories", "labs", "tests", "packages", "labPricing",
      "banners", "coupons", "serviceAreas", "slots", "articles", "offers", "settings",
    ]) {
      expect(paths.has(p), `expected writes to ${p}`).toBe(true);
    }
  });

  // firestore.rules rejects any catalog document whose updatedBy is not
  // the caller's own uid, so a missing one fails the whole import.
  it("attributes every document to the calling admin", async () => {
    await seedStarterCatalog(ACTOR);
    for (const w of fs.writes) {
      expect(w.data.updatedBy, `${w.path}/${w.id} must carry updatedBy`).toBe(ACTOR);
    }
  });

  it("never sends undefined to Firestore", async () => {
    await seedStarterCatalog(ACTOR);
    for (const w of fs.writes) {
      for (const [key, value] of Object.entries(w.data)) {
        expect(value, `${w.path}/${w.id}.${key} must not be undefined`).not.toBeUndefined();
      }
    }
  });

  it("gives every document a deterministic id, never an auto id", async () => {
    await seedStarterCatalog(ACTOR);
    for (const w of fs.writes) {
      expect(typeof w.id).toBe("string");
      expect(w.id.length).toBeGreaterThan(0);
    }
    const ids = fs.writes.map((w) => `${w.path}/${w.id}`);
    expect(new Set(ids).size, "no document may be written twice in one run").toBe(ids.length);
  });

  it("points every reference at a document it actually creates", async () => {
    await seedStarterCatalog(ACTOR);
    const idsIn = (path: string) => new Set(fs.writes.filter((w) => w.path === path).map((w) => w.id));
    const categoryIds = idsIn("testCategories");
    const testIds = idsIn("tests");
    const labIds = idsIn("labs");
    const areaIds = idsIn("serviceAreas");

    for (const t of fs.writes.filter((w) => w.path === "tests")) {
      expect(categoryIds.has(t.data.categoryId as string), `${t.id} -> ${t.data.categoryId}`).toBe(true);
    }
    for (const p of fs.writes.filter((w) => w.path === "packages")) {
      for (const id of p.data.testIds as string[]) expect(testIds.has(id)).toBe(true);
    }
    for (const lp of fs.writes.filter((w) => w.path === "labPricing")) {
      expect(labIds.has(lp.data.labId as string)).toBe(true);
      const target = (lp.data.testId ?? lp.data.packageId) as string;
      expect(testIds.has(target) || idsIn("packages").has(target)).toBe(true);
    }
    for (const s of fs.writes.filter((w) => w.path === "slots")) {
      expect(areaIds.has(s.data.areaId as string)).toBe(true);
    }
  });

  it("omits the tag on the seed packages that have none", async () => {
    await seedStarterCatalog(ACTOR);
    const packages = fs.writes.filter((w) => w.path === "packages");
    const untagged = packages.filter((p) => !("tag" in p.data));
    expect(untagged.length).toBeGreaterThan(0);
    for (const p of packages) {
      if ("tag" in p.data) expect(p.data.tag).toBeTruthy();
    }
  });

  it("marks the import complete with an attributed settings write", async () => {
    await seedStarterCatalog(ACTOR);
    const status = fs.writes.find((w) => w.path === "settings" && w.id === "seedStatus");
    expect(status).toBeDefined();
    expect(status?.data.completed).toBe(true);
    // settings/{id} is gated by validAdminWrite() like any other admin
    // write — the old Cloud Function omitted this and would have been
    // rejected from a browser.
    expect(status?.data.updatedBy).toBe(ACTOR);
  });
});

describe("seedStarterCatalog re-run safety", () => {
  it("skips documents that already exist instead of duplicating them", async () => {
    const first = await seedStarterCatalog(ACTOR);
    const createdIds = new Map<string, string[]>();
    for (const w of fs.writes) {
      createdIds.set(w.path, [...(createdIds.get(w.path) ?? []), w.id]);
    }

    // Second run against a database that now holds the first run's output.
    fs.writes.length = 0;
    fs.existing = createdIds;

    const second = await seedStarterCatalog(ACTOR);

    expect(second.categoriesCreated).toBe(0);
    expect(second.testsCreated).toBe(0);
    expect(second.packagesCreated).toBe(0);
    expect(second.slotsCreated).toBe(0);
    expect(second.labPricingCreated).toBe(0);
    expect(second.skippedExisting).toBeGreaterThan(0);

    // Only the seedStatus marker is rewritten; no catalog document is.
    const rewritten = fs.writes.filter((w) => w.path !== "settings");
    expect(rewritten).toEqual([]);
    expect(first.skippedExisting).toBe(0);
  });

  it("fills in only what is missing after a partially failed import", async () => {
    await seedStarterCatalog(ACTOR);
    const categoriesOnly = fs.writes.filter((w) => w.path === "testCategories").map((w) => w.id);

    fs.writes.length = 0;
    fs.existing.set("testCategories", categoriesOnly);

    const resumed = await seedStarterCatalog(ACTOR);
    expect(resumed.categoriesCreated).toBe(0);
    expect(resumed.testsCreated).toBeGreaterThan(0);
    expect(resumed.labsCreated).toBeGreaterThan(0);
  });
});

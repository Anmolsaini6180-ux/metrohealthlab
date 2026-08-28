import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { stripUndefined } from "@/utils/firestoreData";
import {
  ARTICLES_SEED,
  BANNERS_SEED,
  CATEGORIES_SEED,
  COUPONS_SEED,
  LABS_SEED,
  OFFERS_SEED,
  PACKAGES_SEED,
  SERVICE_AREAS_SEED,
  SLOT_CAPACITY,
  SLOT_DAYS_AHEAD,
  SLOT_WINDOWS,
  TESTS_SEED,
  labPrice,
} from "@/data/starterCatalog";

// The one-time starter catalog import, run from Admin -> Dashboard.
//
// This used to be a callable Cloud Function (seedStarterCatalog). That
// function is not deployed — the project is on the Firebase Spark plan,
// which cannot host Cloud Functions, and firebase.json wires no
// functions target — so every click returned the SDK's bare "internal".
// The import now runs here, against exactly the same collections, under
// exactly the same firestore.rules that gate every other admin catalog
// write: canManageCatalog() plus `updatedBy == request.auth.uid` on
// every document. No rule was relaxed to make this work.
//
// IDEMPOTENCE. Every document gets a deterministic id derived from its
// own natural key (slug, code, pincode, date+window). Re-running the
// import therefore cannot duplicate anything, and a run that failed
// halfway can simply be run again to finish the job. Documents that
// already exist are LEFT ALONE rather than overwritten, so a real edit
// an admin made after the first import — a changed price, a renamed
// test — is never silently reverted, and slot bookedCount / coupon
// usedCount counters are never reset.

const SEED_PREFIX = "seed_";
const SEED_STATUS_DOC = "seedStatus";
// One Firestore batch caps at 500 writes; stay clear of the edge.
const BATCH_LIMIT = 400;
const EXISTING_ID_SCAN_LIMIT = 3000;

export interface SeedResult {
  ok: true;
  categoriesCreated: number;
  labsCreated: number;
  testsCreated: number;
  packagesCreated: number;
  labPricingCreated: number;
  bannersCreated: number;
  couponsCreated: number;
  serviceAreasCreated: number;
  slotsCreated: number;
  articlesCreated: number;
  offersCreated: number;
  skippedExisting: number;
}

export interface StarterCatalogState {
  /** settings/seedStatus exists and is marked completed. */
  completed: boolean;
  completedAt: unknown;
  /** Live document counts for the collections the import targets. */
  counts: Record<string, number>;
  /** True when any target collection already holds data. */
  hasExistingData: boolean;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function seedId(...parts: string[]): string {
  return SEED_PREFIX + parts.map(slugify).filter(Boolean).join("_");
}

async function existingIds(path: string, max = EXISTING_ID_SCAN_LIMIT): Promise<Set<string>> {
  const snap = await getDocs(query(collection(getDb(), path), fsLimit(max)));
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Reads what is actually in the database before offering an import, so
 * the operator makes the decision with real numbers rather than a
 * guess. Never writes anything.
 */
export async function getStarterCatalogState(): Promise<StarterCatalogState> {
  const paths = [
    "testCategories",
    "labs",
    "tests",
    "packages",
    "labPricing",
    "banners",
    "coupons",
    "serviceAreas",
    "slots",
    "articles",
    "offers",
  ];

  const [statusSnap, ...snaps] = await Promise.all([
    getDoc(doc(getDb(), "settings", SEED_STATUS_DOC)),
    ...paths.map((p) => getDocs(query(collection(getDb(), p), fsLimit(EXISTING_ID_SCAN_LIMIT)))),
  ]);

  const counts: Record<string, number> = {};
  paths.forEach((p, i) => {
    counts[p] = snaps[i].size;
  });

  const status = statusSnap.exists() ? statusSnap.data() : null;
  return {
    completed: status?.completed === true,
    completedAt: status?.completedAt ?? null,
    counts,
    hasExistingData: Object.values(counts).some((n) => n > 0),
  };
}

// Accumulates writes and flushes them in Firestore-sized batches.
class BatchWriter {
  private batch = writeBatch(getDb());
  private ops = 0;
  written = 0;
  skipped = 0;

  async create(path: string, id: string, data: Record<string, unknown>, existing: Set<string>): Promise<boolean> {
    if (existing.has(id)) {
      this.skipped++;
      return false;
    }
    // Mark it immediately so a duplicate natural key inside one seed
    // run cannot queue the same document twice in the same batch.
    existing.add(id);
    this.batch.set(doc(getDb(), path, id), stripUndefined(data));
    this.ops++;
    this.written++;
    if (this.ops >= BATCH_LIMIT) await this.flush();
    return true;
  }

  async flush(): Promise<void> {
    if (this.ops === 0) return;
    await this.batch.commit();
    this.batch = writeBatch(getDb());
    this.ops = 0;
  }
}

export interface SeedProgress {
  step: string;
  done: number;
  total: number;
}

/**
 * Imports the starter catalog. Safe to run more than once: anything
 * already present is skipped, never duplicated and never overwritten.
 *
 * `actorUid` must be the signed-in admin's own uid — firestore.rules
 * rejects every document whose `updatedBy` does not match the caller.
 */
export async function seedStarterCatalog(
  actorUid: string,
  onProgress?: (progress: SeedProgress) => void
): Promise<SeedResult> {
  const TOTAL_STEPS = 10;
  let step = 0;
  const report = (name: string) => onProgress?.({ step: name, done: ++step, total: TOTAL_STEPS });

  const stamp = { updatedBy: actorUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const w = new BatchWriter();

  // ---- 1. Categories ----
  report("Categories");
  const categoryIds = await existingIds("testCategories");
  const categoryIdBySlug = new Map<string, string>();
  let categoriesCreated = 0;
  for (let i = 0; i < CATEGORIES_SEED.length; i++) {
    const c = CATEGORIES_SEED[i];
    const id = seedId(c.slug);
    categoryIdBySlug.set(c.slug, id);
    if (await w.create("testCategories", id, { name: c.name, slug: c.slug, icon: c.icon, active: true, displayOrder: i, ...stamp }, categoryIds)) {
      categoriesCreated++;
    }
  }

  // ---- 2. Labs ----
  report("Labs");
  const labExisting = await existingIds("labs");
  const labIds: string[] = [];
  let labsCreated = 0;
  for (const lab of LABS_SEED) {
    const id = seedId(lab.name);
    labIds.push(id);
    if (await w.create("labs", id, { name: lab.name, description: lab.description, serviceAreas: [], testIds: [], packageIds: [], active: true, ...stamp }, labExisting)) {
      labsCreated++;
    }
  }

  // ---- 3. Tests + per-lab pricing ----
  report("Tests");
  const testExisting = await existingIds("tests");
  const pricingExisting = await existingIds("labPricing");
  const testIdByName = new Map<string, string>();
  const allTestIds: string[] = [];
  let testsCreated = 0;
  let labPricingCreated = 0;

  for (let i = 0; i < TESTS_SEED.length; i++) {
    const t = TESTS_SEED[i];
    const id = seedId(t.name);
    testIdByName.set(t.name, id);
    allTestIds.push(id);
    const sellingPrice = t.basePrice;
    // Deterministic category id — the reference can never dangle.
    const categoryId = categoryIdBySlug.get(t.categorySlug) ?? "";
    if (
      await w.create(
        "tests",
        id,
        {
          name: t.name,
          slug: slugify(t.name),
          categoryId,
          description: `${t.description} ${t.why}`.trim(),
          sampleType: t.sampleType,
          fastingRequired: t.fastingRequired,
          preparation: t.preparation,
          homeCollection: t.sampleType !== "Imaging",
          centerCollection: true,
          reportTat: "24 hours",
          mrp: Math.round(sellingPrice * 1.6),
          sellingPrice,
          ageGroup: t.ageGroup,
          gender: "all",
          labIds,
          active: true,
          displayOrder: i,
          ...stamp,
        },
        testExisting
      )
    ) {
      testsCreated++;
    }

    for (let li = 0; li < labIds.length; li++) {
      const lab = LABS_SEED[li];
      const price = labPrice(t.basePrice, li);
      if (
        await w.create(
          "labPricing",
          `${labIds[li]}_test_${id}`,
          {
            labId: labIds[li],
            testId: id,
            price,
            mrp: Math.round(price * 1.6),
            collectionType: lab.name === "Max Labs" ? "center" : "both",
            reportTat: lab.reports24 ? "24 hours" : "48 hours",
            active: true,
            ...stamp,
          },
          pricingExisting
        )
      ) {
        labPricingCreated++;
      }
    }
  }

  // ---- 4. Packages + per-lab pricing ----
  report("Packages");
  const packageExisting = await existingIds("packages");
  const allPackageIds: string[] = [];
  let packagesCreated = 0;

  for (let i = 0; i < PACKAGES_SEED.length; i++) {
    const p = PACKAGES_SEED[i];
    const id = seedId(p.name);
    allPackageIds.push(id);
    const sellingPrice = p.basePrice;
    const matchedTestIds = p.testNames.map((n) => testIdByName.get(n)).filter((x): x is string => !!x);
    if (
      await w.create(
        "packages",
        id,
        {
          name: p.name,
          slug: slugify(p.name),
          category: p.category,
          description: `Includes ${p.testNames.length} tests: ${p.testNames.join(", ")}.`,
          testIds: matchedTestIds,
          mrp: Math.round(sellingPrice * p.mrpMultiplier),
          sellingPrice,
          reportTat: "24 hours",
          homeCollection: true,
          gender: "all",
          labIds,
          rating: p.rating,
          // Three seed packages carry no tag; an absent field is the
          // correct representation, never `undefined`.
          ...(p.tag ? { tag: p.tag } : {}),
          active: true,
          displayOrder: i,
          ...stamp,
        },
        packageExisting
      )
    ) {
      packagesCreated++;
    }

    for (let li = 0; li < labIds.length; li++) {
      const lab = LABS_SEED[li];
      const price = Math.max(999, labPrice(p.basePrice, li, 400));
      if (
        await w.create(
          "labPricing",
          `${labIds[li]}_package_${id}`,
          {
            labId: labIds[li],
            packageId: id,
            price,
            mrp: Math.round(price * 1.6),
            collectionType: lab.name === "Max Labs" ? "center" : "both",
            reportTat: lab.reports24 ? "24 hours" : "48 hours",
            active: true,
            ...stamp,
          },
          pricingExisting
        )
      ) {
        labPricingCreated++;
      }
    }
  }

  // ---- 5. Banners ----
  report("Banners");
  const bannerExisting = await existingIds("banners");
  let bannersCreated = 0;
  for (let i = 0; i < BANNERS_SEED.length; i++) {
    const b = BANNERS_SEED[i];
    if (await w.create("banners", seedId(b.title), { ...b, active: true, displayOrder: i, ...stamp }, bannerExisting)) {
      bannersCreated++;
    }
  }

  // ---- 6. Coupons ----
  report("Coupons");
  const couponExisting = await existingIds("coupons");
  const startDate = new Date().toISOString().slice(0, 10);
  const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let couponsCreated = 0;
  for (const c of COUPONS_SEED) {
    if (await w.create("coupons", seedId(c.code), { ...c, startDate, expiryDate, usedCount: 0, active: true, ...stamp }, couponExisting)) {
      couponsCreated++;
    }
  }

  // ---- 7. Service areas ----
  report("Service areas");
  const areaExisting = await existingIds("serviceAreas");
  const areaIds: string[] = [];
  let serviceAreasCreated = 0;
  for (const a of SERVICE_AREAS_SEED) {
    const id = seedId(a.pincode);
    areaIds.push(id);
    if (await w.create("serviceAreas", id, { ...a, active: true, updatedBy: actorUid }, areaExisting)) {
      serviceAreasCreated++;
    }
  }

  // ---- 8. Slots ----
  // Existing slot ids are read once for the seeded date window only —
  // scanning the whole collection would grow unbounded over time.
  report("Slots");
  const firstDate = new Date().toISOString().slice(0, 10);
  const lastDate = new Date(Date.now() + (SLOT_DAYS_AHEAD - 1) * 86_400_000).toISOString().slice(0, 10);
  const slotSnap = await getDocs(
    query(
      collection(getDb(), "slots"),
      where("date", ">=", firstDate),
      where("date", "<=", lastDate),
      fsLimit(EXISTING_ID_SCAN_LIMIT)
    )
  );
  const slotExisting = new Set(slotSnap.docs.map((d) => d.id));
  let slotsCreated = 0;
  for (let dayOffset = 0; dayOffset < SLOT_DAYS_AHEAD; dayOffset++) {
    const date = new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
    for (const areaId of areaIds) {
      for (const win of SLOT_WINDOWS) {
        for (const collectionType of ["home", "center"] as const) {
          const id = `${areaId}_${date}_${win.startTime.replace(":", "")}_${collectionType}`;
          if (
            await w.create(
              "slots",
              id,
              {
                date,
                startTime: win.startTime,
                endTime: win.endTime,
                areaId,
                collectionType,
                capacity: SLOT_CAPACITY,
                bookedCount: 0,
                active: true,
                ...stamp,
              },
              slotExisting
            )
          ) {
            slotsCreated++;
          }
        }
      }
    }
  }

  // ---- 9. Articles + offers ----
  report("Articles & offers");
  const articleExisting = await existingIds("articles");
  let articlesCreated = 0;
  for (const a of ARTICLES_SEED) {
    if (
      await w.create(
        "articles",
        seedId(a.title),
        { ...a, slug: slugify(a.title), publishedAt: new Date().toISOString(), active: true, updatedBy: actorUid },
        articleExisting
      )
    ) {
      articlesCreated++;
    }
  }

  const offerExisting = await existingIds("offers");
  let offersCreated = 0;
  for (let i = 0; i < OFFERS_SEED.length; i++) {
    const o = OFFERS_SEED[i];
    if (await w.create("offers", seedId(o.couponCode), { ...o, active: true, displayOrder: i, ...stamp }, offerExisting)) {
      offersCreated++;
    }
  }

  await w.flush();

  // ---- 10. Mark the import complete ----
  // settings/{id} is gated by validAdminWrite(), so this document needs
  // `updatedBy` like every other admin write. The old Cloud Function
  // omitted it, which is fine for the Admin SDK but would have been
  // rejected outright from a browser.
  report("Finishing");
  const finalBatch = writeBatch(getDb());
  finalBatch.set(
    doc(getDb(), "settings", SEED_STATUS_DOC),
    stripUndefined({
      completed: true,
      completedBy: actorUid,
      completedAt: serverTimestamp(),
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
  await finalBatch.commit();

  return {
    ok: true,
    categoriesCreated,
    labsCreated,
    testsCreated,
    packagesCreated,
    labPricingCreated,
    bannersCreated,
    couponsCreated,
    serviceAreasCreated,
    slotsCreated,
    articlesCreated,
    offersCreated,
    skippedExisting: w.skipped,
  };
}

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { getCallerClaims } from "./roleClaims";

// One-time import of the business's actual starter catalog — the real
// labs, tests, packages, categories, banners, and coupons this
// business already decided on (extracted from their own product
// reference, metro-health.html), not fabricated placeholder content.
// SUPER_ADMIN-only, and permanently refuses to run a second time once
// it succeeds once (checked via settings/seedStatus) so it can't ever
// duplicate the catalog — after this, all edits go through the normal
// admin CRUD pages like any other catalog change.

interface LabSeed { name: string; description: string; reports24: boolean }
const LABS_SEED: LabSeed[] = [
  { name: "Dr. Lal PathLabs", description: "NABL accredited • 4.7★ rated • Reports in 24 hours", reports24: true },
  { name: "Apollo Diagnostics", description: "NABL accredited • 4.6★ rated • Reports in 24 hours", reports24: true },
  { name: "Metropolis Healthcare", description: "NABL accredited • 4.7★ rated • Reports in 24 hours", reports24: true },
  { name: "Healthians", description: "NABL accredited • 4.5★ rated • Reports in 24 hours", reports24: true },
  { name: "Max Labs", description: "4.6★ rated • Center visit only • Reports in 48 hours", reports24: false },
];

interface CategorySeed { name: string; slug: string; icon: string }
const CATEGORIES_SEED: CategorySeed[] = [
  { name: "Blood Tests", slug: "blood", icon: "water_drop" },
  { name: "Full Body", slug: "fullbody", icon: "verified_user" },
  { name: "X-Ray", slug: "xray", icon: "document_scanner" },
  { name: "MRI", slug: "mri", icon: "biotech" },
  { name: "CT Scan", slug: "ct", icon: "monitor_heart" },
  { name: "Ultrasound", slug: "usg", icon: "air" },
  { name: "ECG", slug: "ecg", icon: "favorite" },
  { name: "Doctor Consult", slug: "doctor", icon: "medical_services" },
  { name: "Diet Consult", slug: "diet", icon: "restaurant" },
  { name: "Home Collection", slug: "home", icon: "local_shipping" },
  { name: "Mammography", slug: "mammo", icon: "monitor_heart" },
  { name: "Fever", slug: "fever", icon: "thermostat" },
  { name: "Diabetes", slug: "diabetes", icon: "water_drop" },
  { name: "Thyroid", slug: "thyroid-concern", icon: "monitor_heart" },
  { name: "PCOS / PCOD", slug: "pcos", icon: "how_to_reg" },
  { name: "Vitamin Deficiency", slug: "vitamin", icon: "auto_awesome" },
  { name: "Heart Health", slug: "heart", icon: "favorite" },
  { name: "Kidney Health", slug: "kidney", icon: "water_drop" },
  { name: "Liver Health", slug: "liver", icon: "local_fire_department" },
  { name: "Women's Health", slug: "women-concern", icon: "how_to_reg" },
  { name: "Men's Health", slug: "men-concern", icon: "how_to_reg" },
  { name: "Senior Health", slug: "senior-concern", icon: "elderly" },
];

interface TestSeed {
  name: string; categorySlug: string; description: string; why: string;
  preparation: string; fastingRequired: boolean; sampleType: string;
  ageGroup: string; basePrice: number;
}
const TESTS_SEED: TestSeed[] = [
  { name: "CBC — Complete Blood Count", categorySlug: "blood", basePrice: 280, fastingRequired: false, sampleType: "Blood", ageGroup: "All ages",
    description: "Measures red cells, white cells and platelets to give an overall picture of your blood health.",
    why: "Commonly used to screen for infection, anaemia and general blood disorders.", preparation: "No special preparation required." },
  { name: "Vitamin D Total", categorySlug: "blood", basePrice: 650, fastingRequired: false, sampleType: "Blood", ageGroup: "Adults",
    description: "Checks the level of Vitamin D in your blood, important for bone and immune health.",
    why: "Ordered when fatigue, bone pain or deficiency symptoms are present.", preparation: "No special preparation required." },
  { name: "Thyroid Profile (TSH, T3, T4)", categorySlug: "blood", basePrice: 450, fastingRequired: false, sampleType: "Blood", ageGroup: "All ages",
    description: "A panel that evaluates thyroid gland function.",
    why: "Used to screen for hypo/hyperthyroidism and monitor treatment.", preparation: "No special preparation required." },
  { name: "Lipid Profile", categorySlug: "blood", basePrice: 400, fastingRequired: true, sampleType: "Blood", ageGroup: "Adults",
    description: "Measures cholesterol and triglyceride levels in the blood.",
    why: "Used to assess cardiovascular risk.", preparation: "8–12 hours fasting recommended." },
  { name: "Liver Function Test (LFT)", categorySlug: "blood", basePrice: 500, fastingRequired: false, sampleType: "Blood", ageGroup: "Adults",
    description: "A group of tests that assess liver health and function.",
    why: "Ordered to evaluate liver enzymes and detect liver conditions.", preparation: "No special preparation required." },
  { name: "Kidney Function Test (KFT)", categorySlug: "blood", basePrice: 500, fastingRequired: false, sampleType: "Blood", ageGroup: "Adults",
    description: "A group of tests that evaluate how well your kidneys are working.",
    why: "Used to screen for kidney disease and monitor kidney health.", preparation: "No special preparation required." },
  { name: "HbA1c", categorySlug: "blood", basePrice: 350, fastingRequired: false, sampleType: "Blood", ageGroup: "Adults",
    description: "Reflects average blood sugar levels over the past 2–3 months.",
    why: "Used to diagnose and monitor diabetes.", preparation: "No special preparation required." },
  { name: "Vitamin B12", categorySlug: "blood", basePrice: 600, fastingRequired: false, sampleType: "Blood", ageGroup: "Adults",
    description: "Measures the level of Vitamin B12, essential for nerve and blood health.",
    why: "Ordered when deficiency symptoms like fatigue or tingling occur.", preparation: "No special preparation required." },
  { name: "Digital X-Ray", categorySlug: "xray", basePrice: 250, fastingRequired: false, sampleType: "Imaging", ageGroup: "All ages",
    description: "Digital radiography imaging for bones and chest.", why: "Center visit only.", preparation: "No special preparation required." },
  { name: "Ultrasound", categorySlug: "usg", basePrice: 899, fastingRequired: false, sampleType: "Imaging", ageGroup: "All ages",
    description: "Ultrasound imaging for abdomen and other regions.", why: "Center visit only.", preparation: "No special preparation required." },
  { name: "CT Scan", categorySlug: "ct", basePrice: 2999, fastingRequired: false, sampleType: "Imaging", ageGroup: "All ages",
    description: "Detailed cross-sectional imaging.", why: "Center visit only.", preparation: "No special preparation required." },
  { name: "MRI", categorySlug: "mri", basePrice: 3499, fastingRequired: false, sampleType: "Imaging", ageGroup: "All ages",
    description: "Magnetic resonance imaging for detailed soft-tissue scans.", why: "Center visit only.", preparation: "No special preparation required." },
  { name: "Mammography", categorySlug: "mammo", basePrice: 1899, fastingRequired: false, sampleType: "Imaging", ageGroup: "Adults",
    description: "Breast imaging for screening.", why: "Center visit only.", preparation: "No special preparation required." },
  { name: "ECG", categorySlug: "ecg", basePrice: 199, fastingRequired: false, sampleType: "Cardiac", ageGroup: "All ages",
    description: "Electrocardiogram to check heart rhythm and electrical activity.", why: "Home & center collection.", preparation: "No special preparation required." },
];

interface PackageSeed {
  name: string; category: string; testNames: string[]; basePrice: number; mrpMultiplier: number;
  rating: number; tag: string;
}
const PACKAGES_SEED: PackageSeed[] = [
  { name: "Metro Full Body Health Check", category: "Full Body", basePrice: 1299, mrpMultiplier: 2.69, rating: 4.7, tag: "Popular",
    testNames: ["CBC — Complete Blood Count", "Lipid Profile", "Liver Function Test (LFT)", "Kidney Function Test (KFT)", "Thyroid Profile (TSH, T3, T4)", "Vitamin D Total", "Vitamin B12", "HbA1c", "ECG"] },
  { name: "Diabetes Care Package", category: "Diabetes", basePrice: 649, mrpMultiplier: 2.31, rating: 4.6, tag: "Chronic Care",
    testNames: ["HbA1c", "Lipid Profile", "Kidney Function Test (KFT)"] },
  { name: "Complete Thyroid Package", category: "Thyroid", basePrice: 499, mrpMultiplier: 2.0, rating: 4.6, tag: "",
    testNames: ["Thyroid Profile (TSH, T3, T4)"] },
  { name: "Women's Wellness Package", category: "Women", basePrice: 1499, mrpMultiplier: 2.2, rating: 4.8, tag: "Recommended",
    testNames: ["CBC — Complete Blood Count", "Thyroid Profile (TSH, T3, T4)", "Vitamin D Total", "Vitamin B12", "HbA1c", "Lipid Profile"] },
  { name: "Men's Health Package", category: "Men", basePrice: 1599, mrpMultiplier: 2.25, rating: 4.6, tag: "",
    testNames: ["CBC — Complete Blood Count", "Lipid Profile", "Liver Function Test (LFT)", "Kidney Function Test (KFT)", "Thyroid Profile (TSH, T3, T4)", "HbA1c"] },
  { name: "Senior Citizen Package", category: "Senior Citizen", basePrice: 1899, mrpMultiplier: 2.26, rating: 4.7, tag: "60+",
    testNames: ["CBC — Complete Blood Count", "Lipid Profile", "Liver Function Test (LFT)", "Kidney Function Test (KFT)", "Thyroid Profile (TSH, T3, T4)", "HbA1c", "Vitamin D Total", "Vitamin B12", "ECG"] },
  { name: "Essential Vitamin Package", category: "Vitamins", basePrice: 1399, mrpMultiplier: 1.86, rating: 4.5, tag: "",
    testNames: ["Vitamin D Total", "Vitamin B12"] },
];

const BANNERS_SEED = [
  { title: "Complete Health Checkups", subtitle: "Starting from ₹999", ctaLabel: "Book Now", ctaLink: "/packages" },
  { title: "Home Sample Collection", subtitle: "Safe & convenient, at your doorstep", ctaLabel: "Book Now", ctaLink: "/book" },
  { title: "Compare Diagnostic Labs", subtitle: "Choose the lab that suits you", ctaLabel: "Compare Now", ctaLink: "/labs" },
  { title: "Up to 70% OFF", subtitle: "On selected diagnostic tests", ctaLabel: "Explore Offers", ctaLink: "/tests" },
];

const COUPONS_SEED = [
  { code: "WELCOME50", discountType: "flat" as const, discountValue: 50, minimumOrder: 300 },
  { code: "HEALTH100", discountType: "flat" as const, discountValue: 100, minimumOrder: 999 },
  { code: "FULLBODY30", discountType: "percentage" as const, discountValue: 30, maximumDiscount: 500, minimumOrder: 0 },
];

// Service areas the business actually serves (from their own reference).
// Without at least one of these, the booking flow's pincode check can
// never pass — so this is essential seed data, not optional extra.
const SERVICE_AREAS_SEED = [
  { pincode: "201309", city: "Ghaziabad", area: "Sector 62", homeCollectionAvailable: true, collectionFee: 0 },
  { pincode: "201301", city: "Noida", area: "Sector 63", homeCollectionAvailable: true, collectionFee: 0 },
  { pincode: "201310", city: "Noida", area: "Sector 64", homeCollectionAvailable: true, collectionFee: 50 },
  { pincode: "110096", city: "Delhi", area: "Mayur Vihar", homeCollectionAvailable: true, collectionFee: 50 },
];

// The daily collection windows from the reference. Seeded for the next
// 14 days per area so the booking calendar has real, bookable slots
// immediately — capacity is per-slot and enforced transactionally by
// createBooking, so these are real constraints, not decoration.
const SLOT_WINDOWS = [
  { startTime: "06:00", endTime: "08:00" },
  { startTime: "08:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "12:00" },
  { startTime: "12:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "16:00" },
  { startTime: "16:00", endTime: "18:00" },
];
const SLOT_DAYS_AHEAD = 14;
const SLOT_CAPACITY = 8;

const ARTICLES_SEED = [
  { title: "5 early signs of Vitamin D deficiency", category: "Vitamins",
    excerpt: "Fatigue, bone pain and low mood can all point to low Vitamin D — here's what to watch for.",
    body: "Vitamin D deficiency is common and often goes unnoticed because the early signs are easy to dismiss.\n\n1. Persistent fatigue — feeling tired even after a full night's sleep.\n2. Bone and lower back pain — Vitamin D helps your body absorb calcium.\n3. Low mood — deficiency has been linked with mood changes, particularly in winter.\n4. Slow wound healing.\n5. Hair thinning.\n\nA simple Vitamin D Total blood test confirms your level. Talk to your doctor before starting any supplement." },
  { title: "Fasting vs non-fasting: what your lipid test needs", category: "Preventive Health",
    excerpt: "Whether you need to fast before a lipid profile depends on what your doctor is looking for.",
    body: "A lipid profile measures cholesterol and triglycerides.\n\nTraditionally, 8–12 hours of fasting was standard, mainly because triglyceride readings are the most affected by a recent meal. Total and HDL cholesterol change very little either way.\n\nIf your doctor has asked for a fasting sample, drink water normally — plain water does not affect the result. If you are on medication, ask your doctor whether to take it before the test.\n\nAlways follow the specific instruction on your prescription over any general guidance." },
  { title: "Understanding your thyroid report", category: "Thyroid",
    excerpt: "TSH, T3 and T4 — what each value on your thyroid panel actually means.",
    body: "A thyroid profile usually reports three values:\n\nTSH (Thyroid Stimulating Hormone) — produced by the pituitary gland to tell the thyroid how much hormone to make. A high TSH often suggests an underactive thyroid; a low TSH may suggest an overactive one.\n\nT4 (Thyroxine) — the main hormone the thyroid produces.\n\nT3 (Triiodothyronine) — the more active form, converted from T4.\n\nReference ranges vary between labs, so always read your result against the range printed on your own report, and discuss it with your doctor rather than self-interpreting." },
  { title: "A simple guide to HbA1c for diabetes tracking", category: "Diabetes",
    excerpt: "HbA1c shows your average blood sugar over 2–3 months — not just today's reading.",
    body: "A fasting sugar test tells you about this morning. HbA1c tells you about the last two to three months.\n\nIt works by measuring how much glucose has attached to the haemoglobin in your red blood cells. Because those cells live about three months, the result reflects an average over that period.\n\nThis makes HbA1c useful both for diagnosing diabetes and for tracking how well existing treatment is working over time. It does not replace daily monitoring if your doctor has asked you to do that — the two answer different questions.\n\nDiscuss your target range with your doctor; it is not the same for everyone." },
];

const OFFERS_SEED = [
  { title: "Flat ₹50 off your first booking", subtitle: "New customers", description: "Use code WELCOME50 at checkout.",
    discountType: "flat" as const, discountValue: 50, couponCode: "WELCOME50" },
  { title: "₹100 off on orders above ₹999", subtitle: "Limited period", description: "Use code HEALTH100 at checkout.",
    discountType: "flat" as const, discountValue: 100, couponCode: "HEALTH100" },
  { title: "30% off Full Body packages", subtitle: "Up to ₹500 off", description: "Use code FULLBODY30 at checkout.",
    discountType: "percentage" as const, discountValue: 30, couponCode: "FULLBODY30" },
];

// Deterministic per-lab price jitter, same shape as the original
// product reference's labPricing(base, spread) helper — real per-lab
// variation, not random noise.
function labPrice(base: number, labIndex: number, spread = 60): number {
  const jitter = Math.round(((labIndex * 37 + base) % spread) - spread / 2);
  return Math.max(149, base + jitter);
}

export const seedStarterCatalog = onCall(async (request) => {
  const caller = getCallerClaims(request);
  if (caller.role !== "SUPER_ADMIN") {
    throw new HttpsError("permission-denied", "Only a SUPER_ADMIN can import the starter catalog.");
  }
  const actorUid = request.auth!.uid;

  const statusRef = db.collection("settings").doc("seedStatus");
  const statusSnap = await statusRef.get();
  if (statusSnap.exists && statusSnap.data()?.completed) {
    throw new HttpsError("failed-precondition", "The starter catalog has already been imported once — further changes go through the normal admin pages.");
  }

  const now = FieldValue.serverTimestamp();

  // 1. Categories
  const categoryIdBySlug = new Map<string, string>();
  for (let i = 0; i < CATEGORIES_SEED.length; i++) {
    const c = CATEGORIES_SEED[i];
    const ref = await db.collection("testCategories").add({
      name: c.name, slug: c.slug, icon: c.icon, active: true, displayOrder: i, updatedBy: actorUid, createdAt: now, updatedAt: now,
    });
    categoryIdBySlug.set(c.slug, ref.id);
  }

  // 2. Labs
  const labIds: string[] = [];
  for (const lab of LABS_SEED) {
    const ref = await db.collection("labs").add({
      name: lab.name, description: lab.description, serviceAreas: [], testIds: [], packageIds: [],
      active: true, updatedBy: actorUid, createdAt: now, updatedAt: now,
    });
    labIds.push(ref.id);
  }

  // 3. Tests + per-lab pricing
  const testIdByName = new Map<string, string>();
  const allTestIds: string[] = [];
  for (let i = 0; i < TESTS_SEED.length; i++) {
    const t = TESTS_SEED[i];
    const categoryId = categoryIdBySlug.get(t.categorySlug) ?? "";
    const sellingPrice = t.basePrice;
    const slug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const ref = await db.collection("tests").add({
      name: t.name, slug, categoryId, description: `${t.description} ${t.why}`.trim(),
      sampleType: t.sampleType, fastingRequired: t.fastingRequired, preparation: t.preparation,
      homeCollection: t.sampleType !== "Imaging", centerCollection: true,
      reportTat: "24 hours", mrp: Math.round(sellingPrice * 1.6), sellingPrice,
      ageGroup: t.ageGroup, gender: "all", labIds, active: true, displayOrder: i,
      updatedBy: actorUid, createdAt: now, updatedAt: now,
    });
    testIdByName.set(t.name, ref.id);
    allTestIds.push(ref.id);

    for (let li = 0; li < labIds.length; li++) {
      const lab = LABS_SEED[li];
      const price = labPrice(t.basePrice, li);
      await db.collection("labPricing").add({
        labId: labIds[li], testId: ref.id, price, mrp: Math.round(price * 1.6),
        collectionType: lab.name === "Max Labs" ? "center" : "both",
        reportTat: lab.reports24 ? "24 hours" : "48 hours",
        active: true, updatedBy: actorUid, createdAt: now, updatedAt: now,
      });
    }
  }

  // 4. Packages + per-lab pricing
  const allPackageIds: string[] = [];
  for (let i = 0; i < PACKAGES_SEED.length; i++) {
    const p = PACKAGES_SEED[i];
    const matchedTestIds = p.testNames.map((n) => testIdByName.get(n)).filter((id): id is string => !!id);
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const sellingPrice = p.basePrice;
    const ref = await db.collection("packages").add({
      name: p.name, slug, category: p.category,
      description: `Includes ${p.testNames.length} tests: ${p.testNames.join(", ")}.`,
      testIds: matchedTestIds, mrp: Math.round(sellingPrice * p.mrpMultiplier), sellingPrice,
      reportTat: "24 hours", homeCollection: true, gender: "all", labIds, rating: p.rating,
      // Three seed packages carry no tag. `tag: p.tag || undefined`
      // wrote the key with an undefined value, which the Admin SDK
      // refuses — and it would abort this one-time import midway,
      // after categories/labs/tests had already been written.
      ...(p.tag ? { tag: p.tag } : {}),
      active: true, displayOrder: i, updatedBy: actorUid, createdAt: now, updatedAt: now,
    });
    allPackageIds.push(ref.id);

    for (let li = 0; li < labIds.length; li++) {
      const lab = LABS_SEED[li];
      const price = labPrice(p.basePrice, li, 400);
      await db.collection("labPricing").add({
        labId: labIds[li], packageId: ref.id, price: Math.max(999, price), mrp: Math.round(Math.max(999, price) * 1.6),
        collectionType: lab.name === "Max Labs" ? "center" : "both",
        reportTat: lab.reports24 ? "24 hours" : "48 hours",
        active: true, updatedBy: actorUid, createdAt: now, updatedAt: now,
      });
    }
  }

  // Now that tests/packages exist, update each lab's testIds/packageIds
  for (const labId of labIds) {
    await db.collection("labs").doc(labId).update({ testIds: allTestIds, packageIds: allPackageIds });
  }

  // 5. Banners
  for (let i = 0; i < BANNERS_SEED.length; i++) {
    const b = BANNERS_SEED[i];
    await db.collection("banners").add({ ...b, active: true, displayOrder: i, updatedBy: actorUid, createdAt: now, updatedAt: now });
  }

  // 6. Coupons
  const startDate = new Date().toISOString().slice(0, 10);
  const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const c of COUPONS_SEED) {
    await db.collection("coupons").add({
      ...c, startDate, expiryDate, usedCount: 0, active: true, updatedBy: actorUid, createdAt: now, updatedAt: now,
    });
  }

  // 7. Service areas — required for the booking flow's pincode check
  const areaIds: string[] = [];
  for (const a of SERVICE_AREAS_SEED) {
    const ref = await db.collection("serviceAreas").add({ ...a, active: true, updatedBy: actorUid });
    areaIds.push(ref.id);
  }

  // 8. Slots — next 14 days x 6 windows per area, both collection types.
  // Batched (Firestore caps a batch at 500 writes) since this is by far
  // the highest-volume part of the seed.
  let slotsCreated = 0;
  let batch = db.batch();
  let opsInBatch = 0;
  for (let dayOffset = 0; dayOffset < SLOT_DAYS_AHEAD; dayOffset++) {
    const date = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const areaId of areaIds) {
      for (const w of SLOT_WINDOWS) {
        for (const collectionType of ["home", "center"] as const) {
          const ref = db.collection("slots").doc();
          batch.set(ref, {
            date, startTime: w.startTime, endTime: w.endTime, areaId, collectionType,
            capacity: SLOT_CAPACITY, bookedCount: 0, active: true,
            updatedBy: actorUid, createdAt: now, updatedAt: now,
          });
          slotsCreated++;
          opsInBatch++;
          if (opsInBatch >= 450) {
            await batch.commit();
            batch = db.batch();
            opsInBatch = 0;
          }
        }
      }
    }
  }
  if (opsInBatch > 0) await batch.commit();

  // 9. Articles
  for (const a of ARTICLES_SEED) {
    const slug = a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await db.collection("articles").add({
      title: a.title, slug, excerpt: a.excerpt, body: a.body, categoryId: a.category,
      active: true, publishedAt: new Date().toISOString(), updatedBy: actorUid,
    });
  }

  // 10. Offers
  for (let i = 0; i < OFFERS_SEED.length; i++) {
    await db.collection("offers").add({
      ...OFFERS_SEED[i], startAt: startDate, endAt: expiryDate,
      active: true, displayOrder: i, updatedBy: actorUid, createdAt: now, updatedAt: now,
    });
  }

  // 11. Branding — only set if the owner hasn't already customized it,
  // so re-running never clobbers real settings they've since changed.
  const brandingRef = db.collection("settings").doc("branding");
  const brandingSnap = await brandingRef.get();
  if (!brandingSnap.exists) {
    await brandingRef.set({
      businessName: "Metro Health Lab",
      tagline: "Accurate tests. Better health.",
      updatedBy: actorUid,
      updatedAt: now,
    });
  }

  await statusRef.set({ completed: true, completedBy: actorUid, completedAt: now });

  return {
    ok: true,
    categoriesCreated: CATEGORIES_SEED.length,
    labsCreated: labIds.length,
    testsCreated: allTestIds.length,
    packagesCreated: allPackageIds.length,
    bannersCreated: BANNERS_SEED.length,
    couponsCreated: COUPONS_SEED.length,
    serviceAreasCreated: areaIds.length,
    slotsCreated,
    articlesCreated: ARTICLES_SEED.length,
    offersCreated: OFFERS_SEED.length,
  };
});

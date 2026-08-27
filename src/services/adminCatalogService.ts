import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where, limit as fsLimit } from "firebase/firestore";

const ADMIN_LIST_LIMIT = 300; // defensive cap — admin tables should not load thousands of records at once
import { getDb } from "@/firebase/firestore";
import type { DiagnosticTest, TestCategory } from "@/types/test";
import type { HealthPackage } from "@/types/package";
import type { Lab, LabPricing } from "@/types/lab";
import type { Offer, Banner, Article } from "@/types/content";
import type { Coupon } from "@/types/coupon";
import type { Slot } from "@/types/slot";
import type { ServiceArea } from "@/types/serviceArea";

// Direct Firestore writes, gated by firestore.rules (canManageCatalog()
// + updatedBy must equal the caller's own uid). A Firestore-triggered
// Cloud Function (catalogAuditTriggers.ts) picks up every change here
// and writes the audit log entry — see its comment for why this
// collection doesn't go through a dedicated Cloud Function the way
// bookings/payments do. Every function here takes the caller's own uid
// explicitly rather than reading it from anywhere else, since the rules
// check depends on it exactly matching request.auth.uid.

// Unlike the customer-facing testService (which only ever shows
// active:true), admin screens need to see and manage inactive/archived
// items too.
export async function getAllTests(): Promise<DiagnosticTest[]> {
  const q = query(collection(getDb(), "tests"), orderBy("displayOrder", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiagnosticTest));
}

export async function getAllTestCategories(): Promise<TestCategory[]> {
  const q = query(collection(getDb(), "testCategories"), orderBy("displayOrder", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TestCategory));
}

export async function createTest(
  actorUid: string,
  data: Omit<DiagnosticTest, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "tests"), {
    ...data,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTest(
  actorUid: string,
  testId: string,
  data: Partial<Omit<DiagnosticTest, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), "tests", testId), {
    ...data,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

export async function createTestCategory(
  actorUid: string,
  data: Omit<TestCategory, "id">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "testCategories"), {
    ...data,
    updatedBy: actorUid,
  });
  return ref.id;
}

export async function updateTestCategory(
  actorUid: string,
  categoryId: string,
  data: Partial<Omit<TestCategory, "id">>
): Promise<void> {
  await updateDoc(doc(getDb(), "testCategories", categoryId), {
    ...data,
    updatedBy: actorUid,
  });
}

// ---------- Packages ----------

export async function getAllPackages(): Promise<HealthPackage[]> {
  const q = query(collection(getDb(), "packages"), orderBy("displayOrder", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthPackage));
}

export async function createPackage(
  actorUid: string,
  data: Omit<HealthPackage, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "packages"), {
    ...data,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePackage(
  actorUid: string,
  packageId: string,
  data: Partial<Omit<HealthPackage, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), "packages", packageId), {
    ...data,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

// ---------- Labs ----------

export async function getAllLabs(): Promise<Lab[]> {
  const q = query(collection(getDb(), "labs"), orderBy("name", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lab));
}

export async function createLab(
  actorUid: string,
  data: Omit<Lab, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "labs"), {
    ...data,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLab(
  actorUid: string,
  labId: string,
  data: Partial<Omit<Lab, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), "labs", labId), {
    ...data,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

// ---------- Lab pricing ----------

export async function getLabPricingForItem(itemType: "test" | "package", itemId: string): Promise<LabPricing[]> {
  const field = itemType === "test" ? "testId" : "packageId";
  const q = query(collection(getDb(), "labPricing"), where(field, "==", itemId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LabPricing));
}

export async function createLabPricing(
  actorUid: string,
  data: Omit<LabPricing, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), "labPricing"), {
    ...data,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLabPricing(
  actorUid: string,
  pricingId: string,
  data: Partial<Omit<LabPricing, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), "labPricing", pricingId), {
    ...data,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

// ---------- Offers ----------

export async function getAllOffers(): Promise<Offer[]> {
  const q = query(collection(getDb(), "offers"), orderBy("displayOrder", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer));
}

export async function createOffer(actorUid: string, data: Omit<Offer, "id" | "updatedBy" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(getDb(), "offers"), {
    ...data,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOffer(actorUid: string, offerId: string, data: Partial<Omit<Offer, "id" | "updatedBy" | "createdAt">>): Promise<void> {
  await updateDoc(doc(getDb(), "offers", offerId), { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

// ---------- Banners ----------

export async function getAllBanners(): Promise<Banner[]> {
  const q = query(collection(getDb(), "banners"), orderBy("displayOrder", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Banner));
}

export async function createBanner(actorUid: string, data: Omit<Banner, "id" | "updatedBy" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(getDb(), "banners"), {
    ...data,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBanner(actorUid: string, bannerId: string, data: Partial<Omit<Banner, "id" | "updatedBy" | "createdAt">>): Promise<void> {
  await updateDoc(doc(getDb(), "banners", bannerId), { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

// ---------- Coupons ----------

export async function getAllCoupons(): Promise<Coupon[]> {
  const q = query(collection(getDb(), "coupons"), orderBy("code", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coupon));
}

export async function createCoupon(actorUid: string, data: Omit<Coupon, "id" | "updatedBy" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(getDb(), "coupons"), {
    ...data,
    code: data.code.toUpperCase(),
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCoupon(actorUid: string, couponId: string, data: Partial<Omit<Coupon, "id" | "updatedBy" | "createdAt">>): Promise<void> {
  await updateDoc(doc(getDb(), "coupons", couponId), { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

// ---------- Slots ----------

export async function getAllSlots(areaId?: string): Promise<Slot[]> {
  const q = areaId
    ? query(collection(getDb(), "slots"), where("areaId", "==", areaId), orderBy("date", "asc"), fsLimit(ADMIN_LIST_LIMIT))
    : query(collection(getDb(), "slots"), orderBy("date", "desc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Slot));
}

export async function createSlot(actorUid: string, data: Omit<Slot, "id" | "updatedBy" | "bookedCount" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(getDb(), "slots"), {
    ...data,
    bookedCount: 0,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSlot(actorUid: string, slotId: string, data: Partial<Omit<Slot, "id" | "updatedBy" | "bookedCount" | "createdAt">>): Promise<void> {
  await updateDoc(doc(getDb(), "slots", slotId), { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

// ---------- Service areas ----------

export async function getAllServiceAreas(): Promise<ServiceArea[]> {
  const q = query(collection(getDb(), "serviceAreas"), orderBy("city", "asc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceArea));
}

export async function createServiceArea(actorUid: string, data: Omit<ServiceArea, "id" | "updatedBy">): Promise<string> {
  const ref = await addDoc(collection(getDb(), "serviceAreas"), { ...data, updatedBy: actorUid });
  return ref.id;
}

export async function updateServiceArea(actorUid: string, areaId: string, data: Partial<Omit<ServiceArea, "id" | "updatedBy">>): Promise<void> {
  await updateDoc(doc(getDb(), "serviceAreas", areaId), { ...data, updatedBy: actorUid });
}

// ---------- Articles ----------
// Per the content-audit rule (only build admin for content types the
// customer site actually renders): FAQs and Testimonials were checked
// and neither is currently displayed anywhere on the customer site
// (Faq/getFaqs exists as unused schema; there's no Testimonial type at
// all), so no admin screens were built for them — only Articles, which
// ArticlesPage/ArticleDetailPage genuinely consume.

export async function getAllArticles(): Promise<Article[]> {
  const q = query(collection(getDb(), "articles"), orderBy("publishedAt", "desc"), fsLimit(ADMIN_LIST_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Article));
}

export async function createArticle(actorUid: string, data: Omit<Article, "id" | "updatedBy">): Promise<string> {
  const ref = await addDoc(collection(getDb(), "articles"), { ...data, updatedBy: actorUid });
  return ref.id;
}

export async function updateArticle(actorUid: string, articleId: string, data: Partial<Omit<Article, "id" | "updatedBy">>): Promise<void> {
  await updateDoc(doc(getDb(), "articles", articleId), { ...data, updatedBy: actorUid });
}

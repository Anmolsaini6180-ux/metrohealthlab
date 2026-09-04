// Supabase-backed. Direct table reads/writes gated by RLS
// (can_manage_catalog(), i.e. SUPER_ADMIN/ADMIN) — the exact same
// boundary shape the Firestore rules used, just enforced by Postgres
// instead. Every function keeps its original exported signature so
// AdminTestsPage/AdminPackagesPage/etc. need no changes.
//
// `labIds` on tests/packages and `testIds`/`packageIds` on labs are
// silently ignored on write: that relationship is authoritative in
// lab_pricing/package_tests (see supabase/mappers.ts), so writing it a
// second time here would create a second, driftable source of truth.
// A package's `testIds` is the one relationship this file DOES persist
// (into package_tests), since nothing else manages that junction.
import { getSupabaseClient } from "@/supabase/client";
import {
  rowToArticle,
  rowToBanner,
  rowToCoupon,
  rowToLab,
  rowToLabPricing,
  rowToOffer,
  rowToPackage,
  rowToServiceArea,
  rowToSlot,
  rowToTest,
  rowToTestCategory,
} from "@/supabase/mappers";
import type { DiagnosticTest, TestCategory } from "@/types/test";
import type { HealthPackage } from "@/types/package";
import type { Lab, LabPricing } from "@/types/lab";
import type { Offer, Banner, Article } from "@/types/content";
import type { Coupon } from "@/types/coupon";
import type { Slot } from "@/types/slot";
import type { ServiceArea } from "@/types/serviceArea";

const ADMIN_LIST_LIMIT = 300;

// null/undefined -> null (no such thing as "omit" on a fixed-schema
// row); a blank string is ALSO treated as "clear the field" -> null,
// matching the same convention every Firestore version of this file
// used via optionalText() -- only here the sentinel is a real SQL NULL
// instead of a signal to omit the key.
function optional<T>(value: T | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return (trimmed === "" ? null : trimmed) as T | null;
  }
  return value;
}

// ---------- Tests ----------

export async function getAllTests(): Promise<DiagnosticTest[]> {
  const { data, error } = await getSupabaseClient().from("tests").select("*").order("display_order", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToTest);
}

export async function getAllTestCategories(): Promise<TestCategory[]> {
  const { data, error } = await getSupabaseClient().from("test_categories").select("*").order("display_order", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToTestCategory);
}

export async function createTest(
  actorUid: string,
  data: Omit<DiagnosticTest, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("tests")
    .insert({
      // REAL, CONFIRMED BUG found while auditing this file: tests.id
      // is `text not null` with no column default and no insert
      // trigger — this insert has never set one, so every "Create
      // test" click has always failed with a 23502 not-null
      // violation. Every one of this file's 11 create* functions had
      // the identical gap; all fixed the same way, matching the
      // pattern addresses/patients already used correctly.
      id: crypto.randomUUID(),
      category_id: data.categoryId,
      name: data.name,
      short_name: optional(data.shortName),
      slug: data.slug,
      description: data.description,
      sample_type: data.sampleType,
      fasting_required: data.fastingRequired,
      preparation: optional(data.preparation),
      home_collection: data.homeCollection,
      center_collection: data.centerCollection,
      report_tat: data.reportTat,
      mrp: data.mrp,
      selling_price: data.sellingPrice,
      discount: optional(data.discount),
      gender: optional(data.gender),
      age_group: optional(data.ageGroup),
      faq: optional(data.faq),
      seo_title: optional(data.seoTitle),
      seo_description: optional(data.seoDescription),
      active: data.active,
      display_order: data.displayOrder ?? 0,
      updated_by_firebase_uid: actorUid,
      tp: optional(data.tp),
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateTest(
  actorUid: string,
  testId: string,
  data: Partial<Omit<DiagnosticTest, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.categoryId !== undefined) patch.category_id = data.categoryId;
  if (data.name !== undefined) patch.name = data.name;
  if (data.shortName !== undefined) patch.short_name = optional(data.shortName);
  if (data.slug !== undefined) patch.slug = data.slug;
  if (data.description !== undefined) patch.description = data.description;
  if (data.sampleType !== undefined) patch.sample_type = data.sampleType;
  if (data.fastingRequired !== undefined) patch.fasting_required = data.fastingRequired;
  if (data.preparation !== undefined) patch.preparation = optional(data.preparation);
  if (data.homeCollection !== undefined) patch.home_collection = data.homeCollection;
  if (data.centerCollection !== undefined) patch.center_collection = data.centerCollection;
  if (data.reportTat !== undefined) patch.report_tat = data.reportTat;
  if (data.mrp !== undefined) patch.mrp = data.mrp;
  if (data.sellingPrice !== undefined) patch.selling_price = data.sellingPrice;
  if (data.discount !== undefined) patch.discount = optional(data.discount);
  if (data.gender !== undefined) patch.gender = optional(data.gender);
  if (data.ageGroup !== undefined) patch.age_group = optional(data.ageGroup);
  if (data.faq !== undefined) patch.faq = optional(data.faq);
  if (data.seoTitle !== undefined) patch.seo_title = optional(data.seoTitle);
  if (data.seoDescription !== undefined) patch.seo_description = optional(data.seoDescription);
  if (data.active !== undefined) patch.active = data.active;
  if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;
  if (data.tp !== undefined) patch.tp = optional(data.tp);

  const { error } = await getSupabaseClient().from("tests").update(patch).eq("id", testId);
  if (error) throw error;
}

// ---------- Test categories ----------

export interface TestCategoryInput {
  name: string;
  slug: string;
  subtitle?: string | null;
  icon?: string | null;
  active: boolean;
  displayOrder?: number;
}

export async function createTestCategory(actorUid: string, input: TestCategoryInput): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("test_categories")
    .insert({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      slug: input.slug.trim(),
      subtitle: optional(input.subtitle),
      icon: optional(input.icon),
      active: input.active,
      display_order: input.displayOrder ?? 0,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateTestCategory(
  actorUid: string,
  categoryId: string,
  input: Partial<TestCategoryInput>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.slug !== undefined) patch.slug = input.slug.trim();
  if (input.active !== undefined) patch.active = input.active;
  if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;
  if (input.subtitle !== undefined) patch.subtitle = optional(input.subtitle);
  if (input.icon !== undefined) patch.icon = optional(input.icon);

  const { error } = await getSupabaseClient().from("test_categories").update(patch).eq("id", categoryId);
  if (error) throw error;
}

// ---------- Packages ----------

async function replacePackageTests(packageId: string, testIds: string[] | undefined): Promise<void> {
  if (testIds === undefined) return; // caller did not touch the test list
  const client = getSupabaseClient();
  const { error: delError } = await client.from("package_tests").delete().eq("package_id", packageId);
  if (delError) throw delError;
  if (testIds.length === 0) return;
  const { error: insError } = await client
    .from("package_tests")
    .insert(testIds.map((testId) => ({ package_id: packageId, test_id: testId })));
  if (insError) throw insError;
}

export async function getAllPackages(): Promise<HealthPackage[]> {
  const { data, error } = await getSupabaseClient()
    .from("packages")
    .select("*, package_tests(test_id)")
    .order("display_order", { ascending: true })
    .limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const pkg = rowToPackage(r);
    pkg.testIds = ((r.package_tests as { test_id: string }[] | undefined) ?? []).map((t) => t.test_id);
    return pkg;
  });
}

export async function createPackage(
  actorUid: string,
  data: Omit<HealthPackage, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("packages")
    .insert({
      id: crypto.randomUUID(),
      name: data.name,
      slug: data.slug,
      category: data.category,
      description: data.description,
      mrp: data.mrp,
      selling_price: data.sellingPrice,
      discount: optional(data.discount),
      report_tat: data.reportTat,
      home_collection: data.homeCollection,
      gender: optional(data.gender),
      age_group: optional(data.ageGroup),
      rating: optional(data.rating),
      tag: optional(data.tag),
      faq: optional(data.faq),
      seo_title: optional(data.seoTitle),
      seo_description: optional(data.seoDescription),
      active: data.active,
      display_order: data.displayOrder ?? 0,
      updated_by_firebase_uid: actorUid,
      tp: optional(data.tp),
    })
    .select("id")
    .single();
  if (error) throw error;
  await replacePackageTests(row.id, data.testIds);
  return row.id;
}

export async function updatePackage(
  actorUid: string,
  packageId: string,
  data: Partial<Omit<HealthPackage, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.slug !== undefined) patch.slug = data.slug;
  if (data.category !== undefined) patch.category = data.category;
  if (data.description !== undefined) patch.description = data.description;
  if (data.mrp !== undefined) patch.mrp = data.mrp;
  if (data.sellingPrice !== undefined) patch.selling_price = data.sellingPrice;
  if (data.discount !== undefined) patch.discount = optional(data.discount);
  if (data.reportTat !== undefined) patch.report_tat = data.reportTat;
  if (data.homeCollection !== undefined) patch.home_collection = data.homeCollection;
  if (data.gender !== undefined) patch.gender = optional(data.gender);
  if (data.ageGroup !== undefined) patch.age_group = optional(data.ageGroup);
  if (data.rating !== undefined) patch.rating = optional(data.rating);
  if (data.tag !== undefined) patch.tag = optional(data.tag);
  if (data.faq !== undefined) patch.faq = optional(data.faq);
  if (data.seoTitle !== undefined) patch.seo_title = optional(data.seoTitle);
  if (data.seoDescription !== undefined) patch.seo_description = optional(data.seoDescription);
  if (data.active !== undefined) patch.active = data.active;
  if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;
  if (data.tp !== undefined) patch.tp = optional(data.tp);

  const { error } = await getSupabaseClient().from("packages").update(patch).eq("id", packageId);
  if (error) throw error;
  await replacePackageTests(packageId, data.testIds);
}

// ---------- Labs ----------

export async function getAllLabs(): Promise<Lab[]> {
  const { data, error } = await getSupabaseClient().from("labs").select("*").order("name", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToLab);
}

export async function createLab(
  actorUid: string,
  data: Omit<Lab, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("labs")
    .insert({
      id: crypto.randomUUID(),
      name: data.name,
      logo: optional(data.logo),
      description: optional(data.description),
      address: optional(data.address),
      phone: optional(data.phone),
      email: optional(data.email),
      service_area_ids: data.serviceAreas.length > 0 ? data.serviceAreas : null,
      active: data.active,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateLab(
  actorUid: string,
  labId: string,
  data: Partial<Omit<Lab, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.logo !== undefined) patch.logo = optional(data.logo);
  if (data.description !== undefined) patch.description = optional(data.description);
  if (data.address !== undefined) patch.address = optional(data.address);
  if (data.phone !== undefined) patch.phone = optional(data.phone);
  if (data.email !== undefined) patch.email = optional(data.email);
  if (data.serviceAreas !== undefined) patch.service_area_ids = data.serviceAreas.length > 0 ? data.serviceAreas : null;
  if (data.active !== undefined) patch.active = data.active;

  const { error } = await getSupabaseClient().from("labs").update(patch).eq("id", labId);
  if (error) throw error;
}

// ---------- Lab pricing ----------

export async function getLabPricingForItem(itemType: "test" | "package", itemId: string): Promise<LabPricing[]> {
  const field = itemType === "test" ? "test_id" : "package_id";
  const { data, error } = await getSupabaseClient().from("lab_pricing").select("*").eq(field, itemId);
  if (error) throw error;
  return (data ?? []).map(rowToLabPricing);
}

export async function createLabPricing(
  actorUid: string,
  data: Omit<LabPricing, "id" | "updatedBy" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("lab_pricing")
    .insert({
      id: crypto.randomUUID(),
      lab_id: data.labId,
      test_id: optional(data.testId),
      package_id: optional(data.packageId),
      price: data.price,
      mrp: data.mrp,
      collection_type: data.collectionType,
      report_tat: data.reportTat,
      active: data.active,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateLabPricing(
  actorUid: string,
  pricingId: string,
  data: Partial<Omit<LabPricing, "id" | "updatedBy" | "createdAt">>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.labId !== undefined) patch.lab_id = data.labId;
  if (data.testId !== undefined) patch.test_id = optional(data.testId);
  if (data.packageId !== undefined) patch.package_id = optional(data.packageId);
  if (data.price !== undefined) patch.price = data.price;
  if (data.mrp !== undefined) patch.mrp = data.mrp;
  if (data.collectionType !== undefined) patch.collection_type = data.collectionType;
  if (data.reportTat !== undefined) patch.report_tat = data.reportTat;
  if (data.active !== undefined) patch.active = data.active;

  const { error } = await getSupabaseClient().from("lab_pricing").update(patch).eq("id", pricingId);
  if (error) throw error;
}

// ---------- Offers ----------

export async function getAllOffers(): Promise<Offer[]> {
  const { data, error } = await getSupabaseClient().from("offers").select("*").order("display_order", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToOffer);
}

export async function createOffer(actorUid: string, data: Omit<Offer, "id" | "updatedBy" | "createdAt" | "updatedAt">): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("offers")
    .insert({
      id: crypto.randomUUID(),
      title: data.title,
      subtitle: optional(data.subtitle),
      description: optional(data.description),
      discount_type: optional(data.discountType),
      discount_value: optional(data.discountValue),
      coupon_code: optional(data.couponCode),
      image_url: optional(data.imageUrl),
      start_at: optional(data.startAt),
      end_at: optional(data.endAt),
      active: data.active,
      featured: !!data.featured,
      display_order: data.displayOrder ?? 0,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateOffer(actorUid: string, offerId: string, data: Partial<Omit<Offer, "id" | "updatedBy" | "createdAt">>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.subtitle !== undefined) patch.subtitle = optional(data.subtitle);
  if (data.description !== undefined) patch.description = optional(data.description);
  if (data.discountType !== undefined) patch.discount_type = optional(data.discountType);
  if (data.discountValue !== undefined) patch.discount_value = optional(data.discountValue);
  if (data.couponCode !== undefined) patch.coupon_code = optional(data.couponCode);
  if (data.imageUrl !== undefined) patch.image_url = optional(data.imageUrl);
  if (data.startAt !== undefined) patch.start_at = optional(data.startAt);
  if (data.endAt !== undefined) patch.end_at = optional(data.endAt);
  if (data.active !== undefined) patch.active = data.active;
  if (data.featured !== undefined) patch.featured = data.featured;
  if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;

  const { error } = await getSupabaseClient().from("offers").update(patch).eq("id", offerId);
  if (error) throw error;
}

// ---------- Banners ----------

export async function getAllBanners(): Promise<Banner[]> {
  const { data, error } = await getSupabaseClient().from("banners").select("*").order("display_order", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToBanner);
}

export async function createBanner(actorUid: string, data: Omit<Banner, "id" | "updatedBy" | "createdAt" | "updatedAt">): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("banners")
    .insert({
      id: crypto.randomUUID(),
      title: data.title,
      subtitle: optional(data.subtitle),
      cta_label: optional(data.ctaLabel),
      cta_link: optional(data.ctaLink),
      image_url: optional(data.imageUrl),
      start_at: optional(data.startAt),
      end_at: optional(data.endAt),
      active: data.active,
      display_order: data.displayOrder ?? 0,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateBanner(actorUid: string, bannerId: string, data: Partial<Omit<Banner, "id" | "updatedBy" | "createdAt">>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.subtitle !== undefined) patch.subtitle = optional(data.subtitle);
  if (data.ctaLabel !== undefined) patch.cta_label = optional(data.ctaLabel);
  if (data.ctaLink !== undefined) patch.cta_link = optional(data.ctaLink);
  if (data.imageUrl !== undefined) patch.image_url = optional(data.imageUrl);
  if (data.startAt !== undefined) patch.start_at = optional(data.startAt);
  if (data.endAt !== undefined) patch.end_at = optional(data.endAt);
  if (data.active !== undefined) patch.active = data.active;
  if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;

  const { error } = await getSupabaseClient().from("banners").update(patch).eq("id", bannerId);
  if (error) throw error;
}

// ---------- Coupons ----------

export async function getAllCoupons(): Promise<Coupon[]> {
  const { data, error } = await getSupabaseClient().from("coupons").select("*").order("code", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToCoupon);
}

export async function createCoupon(actorUid: string, data: Omit<Coupon, "id" | "updatedBy" | "createdAt" | "updatedAt">): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("coupons")
    .insert({
      id: crypto.randomUUID(),
      code: data.code.toUpperCase(),
      discount_type: data.discountType,
      discount_value: data.discountValue,
      minimum_order: optional(data.minimumOrder),
      maximum_discount: optional(data.maximumDiscount),
      applicable_tests: optional(data.applicableTests),
      applicable_packages: optional(data.applicablePackages),
      applicable_labs: optional(data.applicableLabs),
      applicable_cities: optional(data.applicableCities),
      first_order_only: !!data.firstOrderOnly,
      usage_limit: optional(data.usageLimit),
      per_user_limit: optional(data.perUserLimit),
      start_date: data.startDate,
      expiry_date: data.expiryDate,
      active: data.active,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateCoupon(actorUid: string, couponId: string, data: Partial<Omit<Coupon, "id" | "updatedBy" | "createdAt">>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.code !== undefined) patch.code = data.code.toUpperCase();
  if (data.discountType !== undefined) patch.discount_type = data.discountType;
  if (data.discountValue !== undefined) patch.discount_value = data.discountValue;
  if (data.minimumOrder !== undefined) patch.minimum_order = optional(data.minimumOrder);
  if (data.maximumDiscount !== undefined) patch.maximum_discount = optional(data.maximumDiscount);
  if (data.applicableTests !== undefined) patch.applicable_tests = optional(data.applicableTests);
  if (data.applicablePackages !== undefined) patch.applicable_packages = optional(data.applicablePackages);
  if (data.applicableLabs !== undefined) patch.applicable_labs = optional(data.applicableLabs);
  if (data.applicableCities !== undefined) patch.applicable_cities = optional(data.applicableCities);
  if (data.firstOrderOnly !== undefined) patch.first_order_only = data.firstOrderOnly;
  if (data.usageLimit !== undefined) patch.usage_limit = optional(data.usageLimit);
  if (data.perUserLimit !== undefined) patch.per_user_limit = optional(data.perUserLimit);
  if (data.startDate !== undefined) patch.start_date = data.startDate;
  if (data.expiryDate !== undefined) patch.expiry_date = data.expiryDate;
  if (data.active !== undefined) patch.active = data.active;
  // usedCount is server-managed (incremented at redemption time, not
  // from this admin form) and is deliberately never written here.

  const { error } = await getSupabaseClient().from("coupons").update(patch).eq("id", couponId);
  if (error) throw error;
}

// ---------- Slots ----------

export async function getAllSlots(areaId?: string): Promise<Slot[]> {
  let query = getSupabaseClient().from("slots").select("*");
  query = areaId
    ? query.eq("area_id", areaId).order("date", { ascending: true }).limit(ADMIN_LIST_LIMIT)
    : query.order("date", { ascending: false }).limit(ADMIN_LIST_LIMIT);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToSlot);
}

export async function createSlot(actorUid: string, data: Omit<Slot, "id" | "updatedBy" | "bookedCount" | "createdAt" | "updatedAt">): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("slots")
    .insert({
      id: crypto.randomUUID(),
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      area_id: data.areaId,
      collection_type: data.collectionType,
      capacity: data.capacity,
      booked_count: 0,
      active: data.active,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateSlot(actorUid: string, slotId: string, data: Partial<Omit<Slot, "id" | "updatedBy" | "bookedCount" | "createdAt">>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.date !== undefined) patch.date = data.date;
  if (data.startTime !== undefined) patch.start_time = data.startTime;
  if (data.endTime !== undefined) patch.end_time = data.endTime;
  if (data.areaId !== undefined) patch.area_id = data.areaId;
  if (data.collectionType !== undefined) patch.collection_type = data.collectionType;
  if (data.capacity !== undefined) patch.capacity = data.capacity;
  if (data.active !== undefined) patch.active = data.active;

  const { error } = await getSupabaseClient().from("slots").update(patch).eq("id", slotId);
  if (error) throw error;
}

// ---------- Service areas ----------

export async function getAllServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await getSupabaseClient().from("service_areas").select("*").order("city", { ascending: true }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToServiceArea);
}

export async function createServiceArea(actorUid: string, data: Omit<ServiceArea, "id" | "updatedBy">): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("service_areas")
    .insert({
      id: crypto.randomUUID(),
      pincode: data.pincode,
      city: data.city,
      area: optional(data.area),
      home_collection_available: data.homeCollectionAvailable,
      collection_fee: data.collectionFee,
      active: data.active,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateServiceArea(actorUid: string, areaId: string, data: Partial<Omit<ServiceArea, "id" | "updatedBy">>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.pincode !== undefined) patch.pincode = data.pincode;
  if (data.city !== undefined) patch.city = data.city;
  if (data.area !== undefined) patch.area = optional(data.area);
  if (data.homeCollectionAvailable !== undefined) patch.home_collection_available = data.homeCollectionAvailable;
  if (data.collectionFee !== undefined) patch.collection_fee = data.collectionFee;
  if (data.active !== undefined) patch.active = data.active;

  const { error } = await getSupabaseClient().from("service_areas").update(patch).eq("id", areaId);
  if (error) throw error;
}

// ---------- Articles ----------

export async function getAllArticles(): Promise<Article[]> {
  const { data, error } = await getSupabaseClient().from("articles").select("*").order("published_at", { ascending: false }).limit(ADMIN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map(rowToArticle);
}

export async function createArticle(actorUid: string, data: Omit<Article, "id" | "updatedBy">): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("articles")
    .insert({
      id: crypto.randomUUID(),
      title: data.title,
      slug: data.slug,
      category: optional(data.categoryId),
      excerpt: data.excerpt,
      body: data.body,
      cover_image: optional(data.coverImage),
      seo_title: optional(data.seoTitle),
      seo_description: optional(data.seoDescription),
      active: data.active,
      published_at: data.publishedAt,
      updated_by_firebase_uid: actorUid,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updateArticle(actorUid: string, articleId: string, data: Partial<Omit<Article, "id" | "updatedBy">>): Promise<void> {
  const patch: Record<string, unknown> = { updated_by_firebase_uid: actorUid, updated_at: new Date().toISOString() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.slug !== undefined) patch.slug = data.slug;
  if (data.categoryId !== undefined) patch.category = optional(data.categoryId);
  if (data.excerpt !== undefined) patch.excerpt = data.excerpt;
  if (data.body !== undefined) patch.body = data.body;
  if (data.coverImage !== undefined) patch.cover_image = optional(data.coverImage);
  if (data.seoTitle !== undefined) patch.seo_title = optional(data.seoTitle);
  if (data.seoDescription !== undefined) patch.seo_description = optional(data.seoDescription);
  if (data.active !== undefined) patch.active = data.active;
  if (data.publishedAt !== undefined) patch.published_at = data.publishedAt;

  const { error } = await getSupabaseClient().from("articles").update(patch).eq("id", articleId);
  if (error) throw error;
}

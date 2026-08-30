// snake_case Postgres rows -> the exact camelCase TypeScript shapes
// the app already has, so every existing page/component keeps working
// unchanged while only the service layer underneath is replaced.
//
// Each mapper is intentionally explicit (no generic camel-caser) so a
// renamed or added Postgres column produces a visible compile error
// here instead of a silently-missing field somewhere in the UI.
import type { DiagnosticTest, TestCategory } from "@/types/test";
import type { HealthPackage } from "@/types/package";
import type { Lab, LabPricing } from "@/types/lab";
import type { ServiceArea } from "@/types/serviceArea";
import type { Slot } from "@/types/slot";
import type { Banner, Offer, Article } from "@/types/content";
import type { BrandingSettings } from "@/types/settings";
import type { Patient } from "@/types/patient";
import type { Address } from "@/types/address";
import type { AppNotification } from "@/types/notification";
import type { SupportTicket } from "@/types/support";

export function rowToTestCategory(r: Record<string, unknown>): TestCategory {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    subtitle: (r.subtitle as string) ?? undefined,
    icon: (r.icon as string) ?? undefined,
    displayOrder: (r.display_order as number) ?? undefined,
    active: r.active as boolean,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
  };
}

export function rowToTest(r: Record<string, unknown>): DiagnosticTest {
  return {
    id: r.id as string,
    name: r.name as string,
    shortName: (r.short_name as string) ?? undefined,
    slug: r.slug as string,
    categoryId: (r.category_id as string) ?? "",
    description: (r.description as string) ?? "",
    sampleType: (r.sample_type as string) ?? "",
    fastingRequired: !!r.fasting_required,
    preparation: (r.preparation as string) ?? undefined,
    homeCollection: !!r.home_collection,
    centerCollection: !!r.center_collection,
    reportTat: (r.report_tat as string) ?? "",
    mrp: Number(r.mrp ?? 0),
    sellingPrice: Number(r.selling_price ?? 0),
    gender: (r.gender as DiagnosticTest["gender"]) ?? undefined,
    ageGroup: (r.age_group as string) ?? undefined,
    labIds: [], // authoritative relationship now lives in lab_pricing
    active: r.active as boolean,
    displayOrder: (r.display_order as number) ?? undefined,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToPackage(r: Record<string, unknown>): HealthPackage {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    category: (r.category as string) ?? "",
    description: (r.description as string) ?? "",
    testIds: [], // authoritative relationship lives in package_tests
    mrp: Number(r.mrp ?? 0),
    sellingPrice: Number(r.selling_price ?? 0),
    reportTat: (r.report_tat as string) ?? "",
    homeCollection: !!r.home_collection,
    labIds: [],
    rating: r.rating != null ? Number(r.rating) : undefined,
    tag: (r.tag as string) ?? undefined,
    displayOrder: (r.display_order as number) ?? undefined,
    active: r.active as boolean,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as HealthPackage;
}

export function rowToLab(r: Record<string, unknown>): Lab {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? undefined,
    serviceAreas: [],
    testIds: [],
    packageIds: [],
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    active: r.active as boolean,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToLabPricing(r: Record<string, unknown>): LabPricing {
  return {
    id: r.id as string,
    labId: r.lab_id as string,
    testId: (r.test_id as string) ?? undefined,
    packageId: (r.package_id as string) ?? undefined,
    price: Number(r.price ?? 0),
    mrp: Number(r.mrp ?? 0),
    collectionType: (r.collection_type as LabPricing["collectionType"]) ?? "both",
    reportTat: (r.report_tat as string) ?? "",
    active: r.active as boolean,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToServiceArea(r: Record<string, unknown>): ServiceArea {
  return {
    id: r.id as string,
    pincode: r.pincode as string,
    city: (r.city as string) ?? "",
    area: (r.area as string) ?? undefined,
    homeCollectionAvailable: !!r.home_collection_available,
    collectionFee: Number(r.collection_fee ?? 0),
    active: r.active as boolean,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
  };
}

export function rowToSlot(r: Record<string, unknown>): Slot {
  return {
    id: r.id as string,
    date: r.date as string,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    areaId: r.area_id as string,
    collectionType: r.collection_type as Slot["collectionType"],
    capacity: Number(r.capacity ?? 0),
    bookedCount: Number(r.booked_count ?? 0),
    active: r.active as boolean,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    createdAt: r.updated_at,
    updatedAt: r.updated_at,
  };
}

export function rowToBanner(r: Record<string, unknown>): Banner {
  return {
    id: r.id as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? undefined,
    ctaLabel: (r.cta_label as string) ?? undefined,
    ctaLink: (r.cta_link as string) ?? undefined,
    imageUrl: (r.image_url as string) ?? undefined,
    startAt: (r.start_at as string) ?? undefined,
    endAt: (r.end_at as string) ?? undefined,
    active: r.active as boolean,
    displayOrder: (r.display_order as number) ?? undefined,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    createdAt: r.updated_at,
    updatedAt: r.updated_at,
  };
}

export function rowToOffer(r: Record<string, unknown>): Offer {
  return {
    id: r.id as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? undefined,
    description: (r.description as string) ?? undefined,
    discountType: (r.discount_type as Offer["discountType"]) ?? undefined,
    discountValue: r.discount_value != null ? Number(r.discount_value) : undefined,
    couponCode: (r.coupon_code as string) ?? undefined,
    imageUrl: (r.image_url as string) ?? undefined,
    startAt: (r.start_at as string) ?? undefined,
    endAt: (r.end_at as string) ?? undefined,
    active: r.active as boolean,
    featured: !!r.featured,
    displayOrder: (r.display_order as number) ?? undefined,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
    createdAt: r.updated_at,
    updatedAt: r.updated_at,
  };
}

export function rowToArticle(r: Record<string, unknown>): Article {
  return {
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
    categoryId: (r.category as string) ?? undefined,
    excerpt: (r.excerpt as string) ?? "",
    body: (r.body as string) ?? "",
    coverImage: (r.cover_image as string) ?? undefined,
    active: r.active as boolean,
    publishedAt: r.published_at,
    updatedBy: (r.updated_by_firebase_uid as string) ?? undefined,
  };
}

/** settings.data is the whole jsonb document — same shape the
 * Firestore settings/branding document always had, so this is a
 * straight passthrough rather than a field-by-field remap. */
export function rowToBrandingSettings(data: Record<string, unknown>): BrandingSettings {
  return data as unknown as BrandingSettings;
}

export function rowToPatient(r: Record<string, unknown>): Patient {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    relationship: r.relationship as Patient["relationship"],
    dob: r.dob as string,
    gender: r.gender as Patient["gender"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToAddress(r: Record<string, unknown>): Address {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    label: r.label as string,
    house: r.house as string,
    street: r.street as string,
    area: r.area as string,
    city: r.city as string,
    state: r.state as string,
    pincode: r.pincode as string,
    landmark: (r.landmark as string) ?? undefined,
    isDefault: !!r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToNotification(r: Record<string, unknown>): AppNotification {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    title: r.title as string,
    message: (r.message as string) ?? "",
    type: r.type as AppNotification["type"],
    read: !!r.read,
    createdAt: r.created_at,
  };
}

export function rowToSupportTicket(r: Record<string, unknown>): SupportTicket {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    bookingId: (r.booking_id as string) ?? undefined,
    subject: r.subject as string,
    message: r.message as string,
    status: r.status as SupportTicket["status"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

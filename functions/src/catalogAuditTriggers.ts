import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { writeAuditLogDirect } from "./audit";

// Catalog writes (tests, packages, and — by the same copyable pattern —
// labs/categories/offers/banners/coupons/slots/serviceAreas) happen as
// DIRECT Firestore writes from the admin panel, gated by
// firestore.rules (role check + a required `updatedBy` field the rules
// verify matches the caller's own uid — see firestore.rules). That
// keeps ~10 simple CRUD collections from needing a dedicated Cloud
// Function each just to set a field. The audit trail for those writes
// comes from here instead: a Firestore trigger that fires on every
// change and logs who (via the rules-enforced `updatedBy` field) did
// what. Implemented for tests + packages as the reference
// implementation — copy this shape for the remaining catalog
// collections when their admin screens are built.
export const auditTestChanges = onDocumentWritten("tests/{testId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "test.created" : !after ? "test.deleted" : "test.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "test",
    targetId: event.params.testId,
    metadata: { before, after },
  });
});

export const auditPackageChanges = onDocumentWritten("packages/{packageId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "package.created" : !after ? "package.deleted" : "package.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "package",
    targetId: event.params.packageId,
    metadata: { before, after },
  });
});

export const auditLabChanges = onDocumentWritten("labs/{labId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "lab.created" : !after ? "lab.deleted" : "lab.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "lab",
    targetId: event.params.labId,
    metadata: { before, after },
  });
});

// Price changes are explicitly called out as sensitive in the spec —
// audited on their own rather than folded into the lab/test entries.
export const auditLabPricingChanges = onDocumentWritten("labPricing/{pricingId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "labPricing.created" : !after ? "labPricing.deleted" : "labPricing.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "labPricing",
    targetId: event.params.pricingId,
    metadata: { before, after },
  });
});

export const auditOfferChanges = onDocumentWritten("offers/{offerId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "offer.created" : !after ? "offer.deleted" : "offer.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "offer",
    targetId: event.params.offerId,
    metadata: { before, after },
  });
});

export const auditBannerChanges = onDocumentWritten("banners/{bannerId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "banner.created" : !after ? "banner.deleted" : "banner.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "banner",
    targetId: event.params.bannerId,
    metadata: { before, after },
  });
});

export const auditCouponChanges = onDocumentWritten("coupons/{couponId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "coupon.created" : !after ? "coupon.deleted" : "coupon.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "coupon",
    // usedCount changes on every booking redemption (not an admin
    // action) — don't let that noise dominate the audit log.
    targetId: event.params.couponId,
    metadata:
      before && after && Object.keys(after).length === Object.keys(before).length &&
      JSON.stringify({ ...before, usedCount: null }) === JSON.stringify({ ...after, usedCount: null })
        ? { note: "usedCount only (booking redemption, not an admin edit)" }
        : { before, after },
  });
});

export const auditSlotChanges = onDocumentWritten("slots/{slotId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  // bookedCount changes on every booking/cancellation — same "don't let
  // routine operational writes drown out real admin edits" reasoning
  // as coupons.usedCount above.
  const onlyBookedCountChanged =
    before && after &&
    JSON.stringify({ ...before, bookedCount: null }) === JSON.stringify({ ...after, bookedCount: null });

  await writeAuditLogDirect({
    action: !before ? "slot.created" : !after ? "slot.deleted" : "slot.updated",
    actorType: actorUid ? "staff" : "system",
    actorId: actorUid,
    targetType: "slot",
    targetId: event.params.slotId,
    metadata: onlyBookedCountChanged ? { note: "bookedCount only (booking activity, not an admin edit)" } : { before, after },
  });
});

export const auditServiceAreaChanges = onDocumentWritten("serviceAreas/{areaId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "serviceArea.created" : !after ? "serviceArea.deleted" : "serviceArea.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "serviceArea",
    targetId: event.params.areaId,
    metadata: { before, after },
  });
});

export const auditCampaignChanges = onDocumentWritten("campaigns/{campaignId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "campaign.created" : !after ? "campaign.deleted" : "campaign.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "campaign",
    targetId: event.params.campaignId,
    metadata: { before, after },
  });
});

export const auditLeadChanges = onDocumentWritten("leads/{leadId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "lead.created" : !after ? "lead.deleted" : "lead.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "lead",
    targetId: event.params.leadId,
    metadata: { before, after },
  });
});

// Report actions get their own explicit action names (REPORT_CREATED /
// REPORT_MARKED_READY / REPORT_UPDATED) rather than the generic
// created/updated pattern the other triggers use, since "a report
// became ready" is a materially different, more clinically-relevant
// event than an ordinary field edit and is worth being able to filter
// for on its own in the audit log viewer.
export const auditReportChanges = onDocumentWritten("reports/{reportId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  let action: string;
  if (!before) {
    action = "REPORT_CREATED";
  } else if (before.status !== "ready" && after?.status === "ready") {
    action = "REPORT_MARKED_READY";
  } else if (before.filePath !== after?.filePath) {
    action = "REPORT_UPLOADED";
  } else {
    action = "REPORT_UPDATED";
  }

  await writeAuditLogDirect({
    action,
    actorType: "staff",
    actorId: actorUid,
    targetType: "report",
    targetId: event.params.reportId,
    // filePath is a Storage path, not a secret, but there's no reason
    // to duplicate it into the audit log beyond the action itself —
    // keep metadata to just the status transition.
    metadata: { beforeStatus: before?.status ?? null, afterStatus: after?.status ?? null },
  });
});

export const auditArticleChanges = onDocumentWritten("articles/{articleId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "article.created" : !after ? "article.deleted" : "article.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "article",
    targetId: event.params.articleId,
    metadata: { before, after },
  });
});

export const auditSettingsChanges = onDocumentWritten("settings/{settingsId}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const actorUid = (after?.updatedBy ?? before?.updatedBy) as string | undefined;

  await writeAuditLogDirect({
    action: !before ? "settings.created" : "settings.updated",
    actorType: "staff",
    actorId: actorUid,
    targetType: "settings",
    targetId: event.params.settingsId,
    metadata: { before, after },
  });
});

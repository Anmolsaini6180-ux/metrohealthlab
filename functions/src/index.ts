// Entry point Firebase Functions loads. Every exported function here
// becomes a deployed Cloud Function.
//
// Covers the customer flows (booking, quoting, payments, reports) and
// the admin panel (catalog, team, bookings, customers, media,
// notifications, audit). Anything that has to be trusted — pricing,
// payment state, role assignment, report ownership, media metadata —
// is here rather than in the client, because Firestore rules alone
// can't express "recompute this from trusted data".
export { createBooking } from "./createBooking";
export { getBookingQuote } from "./getBookingQuote";
export { createPaymentOrder, razorpayWebhook } from "./payments";
export {
  getReportDownloadUrl,
  getReportUploadSignature,
  confirmReportUpload,
  setReportReady,
} from "./reports";
export { getMediaUploadSignature, confirmMediaUpload, deleteMediaAsset } from "./media";
export { createTeamMember, updateTeamMemberStatus } from "./team";
export { assignBooking, updateBookingStatus } from "./adminBookingActions";
export { getAdminBookings, getTeamMembers, getLeads, getCustomerSegments } from "./adminQueries";
export { getTeamPerformance } from "./adminPerformance";
export { getAuditLogs } from "./adminAuditLogs";
export { bootstrapSuperAdmin } from "./bootstrap";
export { checkOwnerAutoGrant, grantOwnerSuperAdmin } from "./ownerAutoGrant";
export { seedStarterCatalog } from "./seedStarterCatalog";
export { getAdminCustomers, getCustomerDetail } from "./adminCustomers";
export { sendAdminNotification } from "./adminNotifications";
export {
  auditTestChanges,
  auditPackageChanges,
  auditLabChanges,
  auditLabPricingChanges,
  auditOfferChanges,
  auditBannerChanges,
  auditCouponChanges,
  auditSlotChanges,
  auditServiceAreaChanges,
  auditCampaignChanges,
  auditLeadChanges,
  auditReportChanges,
  auditArticleChanges,
  auditSettingsChanges,
} from "./catalogAuditTriggers";

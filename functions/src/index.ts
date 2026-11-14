// Entry point Firebase Functions loads. Every exported function here
// becomes a deployed Cloud Function.
//
// NOTE — THIS TREE IS NOT DEPLOYED. The project runs on the Firebase
// Spark (free) plan, which cannot host Cloud Functions, and
// firebase.json no longer wires this directory into a deploy. It is
// kept as reference for the customer flows (booking, quoting,
// payments, reports) that would need a Blaze upgrade.
//
// AUTHENTICATION AND AUTHORIZATION NO LONGER LIVE HERE. Roles are
// stored in Firestore (system/config + users/{uid}) and enforced by
// firestore.rules; syncMyRole / upsertStaffMember / revokeStaffMember /
// getStaffDirectory / createTeamMember / updateTeamMemberStatus have
// been deleted rather than left as dead endpoints. Anything below that
// still reads request.auth.token.role therefore denies every caller —
// which is the safe direction, but it means this tree would need
// reworking before it could be deployed again.
//
// Covers the customer flows (booking, quoting, payments, reports) and
// the admin panel (catalog, team, bookings, customers, media,
// notifications, audit). Anything that has to be trusted — pricing,
// payment state, role assignment, report ownership, media metadata —
// is here rather than in the client, because Firestore rules alone
// can't express "recompute this from trusted data".
export { createBooking } from "./createBooking";
export { getBookingQuote } from "./getBookingQuote";
export { recordCashReceived, setBookingStatus } from "./cashCollection";

// ---------------------------------------------------------------
// ONLINE PAYMENT IS OUT OF SCOPE FOR THIS DEPLOYMENT.
//
// This build offers cash on home only. payments.ts (Razorpay order
// creation + webhook signature verification) is intentionally NOT
// exported, so it is not deployed and needs no key id, key secret or
// webhook secret to exist anywhere. The file is kept because the
// implementation is complete and correct; re-export it here, add the
// Razorpay secrets to Secret Manager and re-enable the checkout in the
// frontend when online payment is wanted.
// export { createPaymentOrder, razorpayWebhook } from "./payments";
// ---------------------------------------------------------------
export {
  getReportDownloadUrl,
  getReportUploadSignature,
  confirmReportUpload,
  setReportReady,
} from "./reports";
export { getMediaUploadSignature, confirmMediaUpload, deleteMediaAsset } from "./media";
export { assignBooking, updateBookingStatus } from "./adminBookingActions";
export { getAdminBookings, getTeamMembers, getLeads, getCustomerSegments } from "./adminQueries";
export { getTeamPerformance } from "./adminPerformance";
export { getAuditLogs } from "./adminAuditLogs";
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

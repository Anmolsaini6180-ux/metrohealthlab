// The seam between "works in the browser today" and "needs a server".
//
// This project runs on the Firebase Spark plan: no Cloud Functions, and
// firestore.rules deliberately seals the collections whose integrity a
// browser cannot be trusted with (bookings, reports, mediaAssets,
// payments). Some admin features therefore genuinely cannot work yet.
//
// Rather than let those surface as the SDK's bare "internal", every one
// of them raises a BackendRequiredError naming the feature and the
// Cloud Function that will implement it after a Blaze upgrade. Pages
// render a truthful "needs backend" state from that, and when the
// function is deployed the service body switches to callFunction()
// with no change to the page.

/** Stable identifiers for the server-side operations this app expects. */
export type BackendFeature =
  | "adminBookingList"
  | "adminBookingMutation"
  | "adminCustomerDirectory"
  | "adminLeadList"
  | "adminSegments"
  | "adminTeamPerformance"
  | "adminSendNotification"
  | "mediaLibraryIndex"
  | "reportUpload"
  | "reportDownload"
  | "paymentOrder";

interface BackendFeatureSpec {
  /** What the operator was trying to do, in their words. */
  label: string;
  /** Why a browser cannot do it — the actual constraint, not a slogan. */
  reason: string;
  /** The callable that implements it once Functions are deployed. */
  plannedFunction: string;
}

export const BACKEND_FEATURES: Record<BackendFeature, BackendFeatureSpec> = {
  adminBookingList: {
    label: "Booking list and analytics",
    reason:
      "Listing bookings needs hierarchy scoping that Firestore rules cannot express on a list query, so `bookings` is list-denied to every client.",
    plannedFunction: "getAdminBookings",
  },
  adminBookingMutation: {
    label: "Booking status changes and agent assignment",
    reason:
      "Booking writes are server-only: status transitions, slot capacity and the audit trail have to be applied atomically and validated against data the browser must not be trusted with.",
    plannedFunction: "updateBookingStatus / assignBooking",
  },
  adminCustomerDirectory: {
    label: "Customer directory",
    reason:
      "Firestore rules allow staff to list only staff records — a bulk customer dump to the browser is exactly what the rules-only model refuses.",
    plannedFunction: "getAdminCustomers / getCustomerDetail",
  },
  adminLeadList: {
    label: "Lead list",
    reason: "Leads are list-denied to clients; each lead is readable only within its own assignment scope.",
    plannedFunction: "getLeads",
  },
  adminSegments: {
    label: "Customer segments",
    reason: "Segments are computed by aggregating every booking, which a browser cannot read.",
    plannedFunction: "getCustomerSegments",
  },
  adminTeamPerformance: {
    label: "Team performance",
    reason: "Per-agent performance is aggregated from the booking collection, which a browser cannot read.",
    plannedFunction: "getTeamPerformance",
  },
  adminSendNotification: {
    label: "Sending a notification to a customer",
    reason:
      "`notifications` is create-denied to clients so staff cannot write arbitrary messages into another user's feed; the scope check has to run server-side.",
    plannedFunction: "sendAdminNotification",
  },
  mediaLibraryIndex: {
    label: "Shared media library",
    reason:
      "`mediaAssets` rows are written from the storage provider's own verified response so a client cannot fabricate one. Uploading an image still works — only the shared index needs a server.",
    plannedFunction: "confirmMediaUpload / deleteMediaAsset",
  },
  reportUpload: {
    label: "Filing a patient report",
    reason:
      "`reports` is write-denied to clients on purpose: the customer a health report belongs to must be derived from the booking server-side, so a staff account can never file a report against the wrong patient.",
    plannedFunction: "confirmReportUpload / setReportReady",
  },
  reportDownload: {
    label: "Report download links",
    reason: "Report files are stored as authenticated assets; a time-limited signed URL can only be minted with a private key.",
    plannedFunction: "getReportDownloadUrl",
  },
  paymentOrder: {
    label: "Creating a payment order",
    reason: "Razorpay order creation and signature verification require the key secret, which must never reach a browser.",
    plannedFunction: "createPaymentOrder / razorpayWebhook",
  },
};

/**
 * Thrown by a service whose implementation genuinely needs a server.
 * Carries the feature id so a page can render a specific explanation
 * rather than a generic failure.
 */
export class BackendRequiredError extends Error {
  readonly code = "BACKEND_REQUIRED" as const;
  readonly feature: BackendFeature;
  readonly plannedFunction: string;
  readonly detail: string;

  constructor(feature: BackendFeature) {
    const spec = BACKEND_FEATURES[feature];
    super(`${spec.label} requires a backend service.`);
    this.name = "BackendRequiredError";
    this.feature = feature;
    this.detail = spec.reason;
    this.plannedFunction = spec.plannedFunction;
  }
}

export function isBackendRequiredError(error: unknown): error is BackendRequiredError {
  return error instanceof BackendRequiredError;
}

/**
 * Whether Cloud Functions are expected to be reachable at all.
 *
 * Deliberately a build-time flag rather than a runtime probe: on Spark
 * every callable round-trip is a guaranteed failure, and spending one
 * to rediscover that on each page load is waste. Set
 * VITE_FUNCTIONS_ENABLED=true after upgrading to Blaze and deploying —
 * the service bodies below then take their callable path with no UI
 * change.
 */
export function functionsEnabled(): boolean {
  return import.meta.env.VITE_FUNCTIONS_ENABLED === "true";
}

/**
 * Guard for a service backed by a Cloud Function. Call at the top of
 * the service; it throws the typed error while Functions are absent and
 * simply returns once they are deployed.
 */
export function requireBackend(feature: BackendFeature): void {
  if (!functionsEnabled()) throw new BackendRequiredError(feature);
}

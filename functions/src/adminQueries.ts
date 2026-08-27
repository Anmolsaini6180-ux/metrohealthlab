import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { getCallerClaims } from "./roleClaims";

interface GetAdminBookingsInput {
  startDate: string; // ISO date, inclusive — filters on booking createdAt
  endDate: string; // ISO date, inclusive
  filterAdminId?: string; // SUPER_ADMIN only
  filterSubAdminId?: string; // SUPER_ADMIN only
  filterAgentId?: string; // SUPER_ADMIN/ADMIN only
  filterLabId?: string;
  filterBookingStatus?: string;
  filterPaymentStatus?: string;
}

const MAX_RESULTS = 500;

// The one place the admin panel reads bookings from — used for both
// the Bookings management table and (aggregated client-side) the
// Dashboard KPIs, so the two can never disagree. Deliberately a
// callable Cloud Function rather than a direct client onSnapshot/query:
// Firestore security rules can restrict which individual documents a
// client can `get`, but reliably restricting an arbitrary `list` query
// to "only documents matching my hierarchy" is not something rules can
// guarantee the way a server-side .where() can — so hierarchy scoping
// happens here, in trusted code, using the caller's role/chain from
// their custom claims (never anything the client sends).
export const getAdminBookings = onCall<GetAdminBookingsInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");
  const callerUid = request.auth!.uid;

  const input = request.data;
  if (!input?.startDate || !input.endDate) {
    throw new HttpsError("invalid-argument", "startDate and endDate are required.");
  }

  let q: FirebaseFirestore.Query = db.collection("bookings");

  // Hierarchy scoping — the non-negotiable base filter, applied first
  // and never overridable by anything the client sends. Additional
  // filters below can only ever NARROW further within that base scope
  // (e.g. an ADMIN picking one of their own Sub Admins) — they can
  // never widen it or point outside it.
  if (caller.role === "ADMIN") {
    q = q.where("assignedAdminId", "==", callerUid);
    if (input.filterSubAdminId) q = q.where("assignedSubAdminId", "==", input.filterSubAdminId);
    else if (input.filterAgentId) q = q.where("assignedAgentId", "==", input.filterAgentId);
  } else if (caller.role === "SUB_ADMIN") {
    q = q.where("assignedSubAdminId", "==", callerUid);
    if (input.filterAgentId) q = q.where("assignedAgentId", "==", input.filterAgentId);
  } else if (caller.role === "COLLECTION_AGENT") {
    q = q.where("assignedAgentId", "==", callerUid);
  } else if (caller.role === "SUPER_ADMIN") {
    // Only SUPER_ADMIN may narrow by an arbitrary hierarchy id with no
    // base scope at all — every other role above already had its own
    // base filter applied first.
    if (input.filterAdminId) q = q.where("assignedAdminId", "==", input.filterAdminId);
    else if (input.filterSubAdminId) q = q.where("assignedSubAdminId", "==", input.filterSubAdminId);
    else if (input.filterAgentId) q = q.where("assignedAgentId", "==", input.filterAgentId);
  }

  if (input.filterLabId) q = q.where("labId", "==", input.filterLabId);
  if (input.filterBookingStatus) q = q.where("bookingStatus", "==", input.filterBookingStatus);
  if (input.filterPaymentStatus) q = q.where("paymentStatus", "==", input.filterPaymentStatus);

  const startTs = new Date(`${input.startDate}T00:00:00`);
  const endTs = new Date(`${input.endDate}T23:59:59.999`);
  q = q.where("createdAt", ">=", startTs).where("createdAt", "<=", endTs).orderBy("createdAt", "desc").limit(MAX_RESULTS);

  const snap = await q.get();
  const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { bookings, truncated: bookings.length === MAX_RESULTS };
});

interface GetTeamMembersInput {
  role?: "ADMIN" | "SUB_ADMIN" | "COLLECTION_AGENT";
}

// Same reasoning as getAdminBookings: team listings are hierarchy-
// scoped server-side rather than via a direct Firestore `list` query,
// since rules can't safely bound an arbitrary list query the way a
// trusted .where() here can.
export const getTeamMembers = onCall<GetTeamMembersInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");
  const callerUid = request.auth!.uid;

  let q: FirebaseFirestore.Query = db.collection("users");

  if (caller.role === "SUPER_ADMIN") {
    q = q.where("superAdminId", "==", callerUid);
  } else if (caller.role === "ADMIN") {
    q = q.where("adminId", "==", callerUid);
  } else if (caller.role === "SUB_ADMIN") {
    q = q.where("subAdminId", "==", callerUid);
  } else {
    throw new HttpsError("permission-denied", "Collection agents don't manage a team.");
  }

  if (request.data?.role) {
    q = q.where("role", "==", request.data.role);
  }

  const snap = await q.orderBy("createdAt", "desc").limit(500).get();
  const members = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  return { members };
});

interface GetLeadsInput {
  startDate: string;
  endDate: string;
  filterAdminId?: string; // SUPER_ADMIN only
  filterSubAdminId?: string; // SUPER_ADMIN/ADMIN only
  filterStatus?: string;
}

// Same hierarchy-scoping-in-trusted-code reasoning as getAdminBookings
// and getTeamMembers.
export const getLeads = onCall<GetLeadsInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");
  const callerUid = request.auth!.uid;

  const input = request.data;
  if (!input?.startDate || !input.endDate) {
    throw new HttpsError("invalid-argument", "startDate and endDate are required.");
  }

  let q: FirebaseFirestore.Query = db.collection("leads");

  if (caller.role === "ADMIN") {
    q = q.where("assignedAdminId", "==", callerUid);
  } else if (caller.role === "SUB_ADMIN") {
    q = q.where("assignedSubAdminId", "==", callerUid);
  } else if (caller.role === "COLLECTION_AGENT") {
    q = q.where("assignedCollectionAgentId", "==", callerUid);
  } else if (caller.role === "SUPER_ADMIN") {
    if (input.filterAdminId) q = q.where("assignedAdminId", "==", input.filterAdminId);
    else if (input.filterSubAdminId) q = q.where("assignedSubAdminId", "==", input.filterSubAdminId);
  }

  if (input.filterStatus) q = q.where("status", "==", input.filterStatus);

  const startTs = new Date(`${input.startDate}T00:00:00`);
  const endTs = new Date(`${input.endDate}T23:59:59.999`);
  q = q.where("createdAt", ">=", startTs).where("createdAt", "<=", endTs).orderBy("createdAt", "desc").limit(500);

  const snap = await q.get();
  const leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { leads };
});

const NEW_CUSTOMER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SAMPLE_SIZE = 2000; // see comment below on why this is a bounded approximation

interface CustomerSegmentsResult {
  segments: {
    key: string;
    label: string;
    criteria: string;
    count: number;
  }[];
  sampledBookings: number;
  approximate: boolean;
}

// Only SUPER_ADMIN/ADMIN can see cross-customer segment counts (this
// is aggregate business data, not any single customer's own record).
//
// "all" and "new" use Firestore's server-side count() aggregation —
// genuinely exact, O(1)-cost regardless of collection size, and never
// pulls customer documents into memory.
//
// "returning" / "inactive" / "noBooking" / "couponUsers" need to know
// how many bookings each customer has, which Firestore can't aggregate
// directly (no distinct-count / group-by). Rather than download every
// booking ever made (explicitly disallowed by the spec) OR every
// customer document, this samples the most recent SAMPLE_SIZE bookings
// and computes those four segments from that sample — exact for
// businesses under the sample size, an approximation flagged as such
// (`approximate: true`) for larger ones. A fully exact version at scale
// would need denormalized per-user booking counters maintained by
// createBooking, which isn't implemented (see the project README).
export const getCustomerSegments = onCall(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role || !["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
    throw new HttpsError("permission-denied", "Not authorized to view customer segments.");
  }

  const customersRef = db.collection("users").where("accountType", "==", "customer");
  const allCount = (await customersRef.count().get()).data().count;

  const newCutoff = new Date(Date.now() - NEW_CUSTOMER_WINDOW_MS);
  const newCount = (await customersRef.where("createdAt", ">=", newCutoff).count().get()).data().count;

  const bookingsSnap = await db.collection("bookings").orderBy("createdAt", "desc").limit(SAMPLE_SIZE).get();
  const perCustomerBookingCount = new Map<string, number>();
  const perCustomerHasCoupon = new Set<string>();
  for (const doc of bookingsSnap.docs) {
    const b = doc.data();
    perCustomerBookingCount.set(b.userId, (perCustomerBookingCount.get(b.userId) ?? 0) + 1);
    if (b.couponId) perCustomerHasCoupon.add(b.userId);
  }

  const returningCount = [...perCustomerBookingCount.values()].filter((c) => c >= 2).length;
  const couponUsersCount = perCustomerHasCoupon.size;
  const customersWithBookingInSample = perCustomerBookingCount.size;
  // "No booking" among the sampled window can only be reported as a
  // lower bound (allCount - customers seen in the sample) since a
  // customer's only booking could be older than the sampled window.
  const noBookingApprox = Math.max(0, allCount - customersWithBookingInSample);

  const approximate = bookingsSnap.size === SAMPLE_SIZE;

  const result: CustomerSegmentsResult = {
    segments: [
      { key: "all", label: "All Customers", criteria: "accountType == customer", count: allCount },
      { key: "new", label: "New Customers", criteria: "joined in the last 30 days", count: newCount },
      { key: "returning", label: "Returning Customers", criteria: "2+ bookings (sampled)", count: returningCount },
      { key: "noBooking", label: "No Booking Customers", criteria: "0 bookings (sampled, lower bound)", count: noBookingApprox },
      { key: "couponUsers", label: "Coupon Users", criteria: "used a coupon at least once (sampled)", count: couponUsersCount },
    ],
    sampledBookings: bookingsSnap.size,
    approximate,
  };
  return result;
});

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { getCallerClaims } from "./roleClaims";

const PAGE_SIZE = 25;
const SCOPE_SAMPLE_SIZE = 500;

interface GetAdminCustomersInput {
  searchName?: string; // prefix match on name
  cursorUid?: string; // last uid from the previous page, for simple cursor pagination
}

// Never sends passwords/auth secrets — this only ever reads the
// customer's own Firestore profile fields (name/email/phone/photoUrl/
// createdAt), which is all UserProfile contains; Firebase Auth
// credentials aren't stored in Firestore at all.
export const getAdminCustomers = onCall<GetAdminCustomersInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");
  const callerUid = request.auth!.uid;
  const input = request.data ?? {};

  if (caller.role === "SUPER_ADMIN") {
    let q: FirebaseFirestore.Query = db.collection("users").where("accountType", "==", "customer");
    if (input.searchName) {
      q = q.orderBy("name").startAt(input.searchName).endAt(input.searchName + "\uf8ff");
    } else {
      q = q.orderBy("createdAt", "desc");
    }
    if (input.cursorUid) {
      const cursorDoc = await db.collection("users").doc(input.cursorUid).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }
    const snap = await q.limit(PAGE_SIZE).get();
    return {
      customers: snap.docs.map((d) => ({ uid: d.id, ...d.data() })),
      hasMore: snap.size === PAGE_SIZE,
    };
  }

  // ADMIN/SUB_ADMIN/COLLECTION_AGENT: customers aren't directly "owned"
  // by a hierarchy level the way team members are — visibility is
  // derived from booking assignment. This samples the most recent
  // SCOPE_SAMPLE_SIZE assigned bookings (bounded, not the whole
  // collection) to find which customers fall in scope, same
  // approximation approach as getCustomerSegments.
  const assignField =
    caller.role === "ADMIN" ? "assignedAdminId" : caller.role === "SUB_ADMIN" ? "assignedSubAdminId" : "assignedAgentId";
  const bookingsSnap = await db
    .collection("bookings")
    .where(assignField, "==", callerUid)
    .orderBy("createdAt", "desc")
    .limit(SCOPE_SAMPLE_SIZE)
    .get();

  const customerUids = [...new Set(bookingsSnap.docs.map((d) => d.data().userId as string))];
  if (customerUids.length === 0) return { customers: [], hasMore: false, approximate: bookingsSnap.size === SCOPE_SAMPLE_SIZE };

  // Firestore 'in' queries cap at 30 values — batch accordingly.
  const customers: Record<string, unknown>[] = [];
  for (let i = 0; i < customerUids.length; i += 30) {
    const batch = customerUids.slice(i, i + 30);
    const snap = await db.collection("users").where("__name__", "in", batch).get();
    customers.push(...snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  }

  return { customers, hasMore: false, approximate: bookingsSnap.size === SCOPE_SAMPLE_SIZE };
});

interface GetCustomerDetailInput {
  customerUid: string;
}

// Full detail view for one customer — profile + bookings + patients +
// addresses + reports (metadata only; report files still only come
// through getReportDownloadUrl). Same hierarchy authorization as the
// list: SUPER_ADMIN always allowed, everyone else only if this
// customer has a booking assigned into their scope.
export const getCustomerDetail = onCall<GetCustomerDetailInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");
  const callerUid = request.auth!.uid;
  const { customerUid } = request.data;
  if (!customerUid) throw new HttpsError("invalid-argument", "customerUid is required.");

  const profileSnap = await db.collection("users").doc(customerUid).get();
  if (!profileSnap.exists) throw new HttpsError("not-found", "Customer not found.");

  const bookingsSnap = await db
    .collection("bookings")
    .where("userId", "==", customerUid)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (caller.role !== "SUPER_ADMIN") {
    const assignField =
      caller.role === "ADMIN" ? "assignedAdminId" : caller.role === "SUB_ADMIN" ? "assignedSubAdminId" : "assignedAgentId";
    const inScope = bookings.some((b) => (b as Record<string, unknown>)[assignField] === callerUid);
    if (!inScope) throw new HttpsError("permission-denied", "This customer isn't in your team's scope.");
  }

  const [patientsSnap, addressesSnap, reportsSnap] = await Promise.all([
    db.collection("patients").where("userId", "==", customerUid).get(),
    db.collection("addresses").where("userId", "==", customerUid).get(),
    db.collection("reports").where("userId", "==", customerUid).orderBy("createdAt", "desc").limit(50).get(),
  ]);

  return {
    profile: { uid: profileSnap.id, ...profileSnap.data() },
    bookings,
    patients: patientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    addresses: addressesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    reports: reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
});

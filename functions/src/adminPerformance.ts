import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { getCallerClaims } from "./roleClaims";

interface GetTeamPerformanceInput {
  startDate: string;
  endDate: string;
}

interface AgentPerformance {
  uid: string;
  name: string;
  assigned: number;
  completed: number;
  pending: number;
  cancelled: number;
  completionRate: number;
}

const PENDING_STATUSES = ["assigned", "on_the_way", "arrived", "sample_collected", "received_at_lab", "testing", "report_ready"];

// Computes per-agent performance for the caller's own scope — SUPER_ADMIN
// gets every agent, ADMIN gets agents under their own hierarchy,
// SUB_ADMIN gets their own agents, COLLECTION_AGENT gets just their own
// row. Built from a single bounded, date-ranged bookings query (not a
// full collection download) plus one team-members lookup for names.
export const getTeamPerformance = onCall<GetTeamPerformanceInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");
  const callerUid = request.auth!.uid;
  const input = request.data;
  if (!input?.startDate || !input.endDate) {
    throw new HttpsError("invalid-argument", "startDate and endDate are required.");
  }

  let bookingsQuery: FirebaseFirestore.Query = db.collection("bookings");
  let agentsQuery: FirebaseFirestore.Query | null = null;

  if (caller.role === "SUPER_ADMIN") {
    agentsQuery = db.collection("users").where("superAdminId", "==", callerUid).where("role", "==", "COLLECTION_AGENT");
  } else if (caller.role === "ADMIN") {
    bookingsQuery = bookingsQuery.where("assignedAdminId", "==", callerUid);
    agentsQuery = db.collection("users").where("adminId", "==", callerUid).where("role", "==", "COLLECTION_AGENT");
  } else if (caller.role === "SUB_ADMIN") {
    bookingsQuery = bookingsQuery.where("assignedSubAdminId", "==", callerUid);
    agentsQuery = db.collection("users").where("subAdminId", "==", callerUid).where("role", "==", "COLLECTION_AGENT");
  } else {
    // COLLECTION_AGENT: just their own row, no team to enumerate.
    bookingsQuery = bookingsQuery.where("assignedAgentId", "==", callerUid);
  }

  const startTs = new Date(`${input.startDate}T00:00:00`);
  const endTs = new Date(`${input.endDate}T23:59:59.999`);
  bookingsQuery = bookingsQuery.where("createdAt", ">=", startTs).where("createdAt", "<=", endTs).limit(2000);

  const [bookingsSnap, agentsSnap] = await Promise.all([
    bookingsQuery.get(),
    agentsQuery ? agentsQuery.get() : Promise.resolve(null),
  ]);

  const byAgent = new Map<string, { assigned: number; completed: number; pending: number; cancelled: number }>();
  function bump(uid: string, key: "assigned" | "completed" | "pending" | "cancelled") {
    const row = byAgent.get(uid) ?? { assigned: 0, completed: 0, pending: 0, cancelled: 0 };
    row[key] += 1;
    byAgent.set(uid, row);
  }

  for (const doc of bookingsSnap.docs) {
    const b = doc.data();
    const agentUid = (b.assignedAgentId as string | undefined) ?? (caller.role === "COLLECTION_AGENT" ? callerUid : undefined);
    if (!agentUid) continue; // not yet assigned to any agent — doesn't count toward agent performance
    if (b.bookingStatus === "completed") {
      bump(agentUid, "assigned");
      bump(agentUid, "completed");
    } else if (b.bookingStatus === "cancelled" || b.bookingStatus === "refunded") {
      bump(agentUid, "assigned");
      bump(agentUid, "cancelled");
    } else if (PENDING_STATUSES.includes(b.bookingStatus)) {
      bump(agentUid, "assigned");
      bump(agentUid, "pending");
    }
  }

  const agentNames = new Map<string, string>();
  if (agentsSnap) {
    for (const doc of agentsSnap.docs) agentNames.set(doc.id, (doc.data().name as string) ?? doc.id);
  }
  if (caller.role === "COLLECTION_AGENT") {
    // Include the caller's own name even without a team query.
    const selfSnap = await db.collection("users").doc(callerUid).get();
    agentNames.set(callerUid, (selfSnap.data()?.name as string) ?? callerUid);
  }

  // Include every agent in scope even with zero bookings in range (a
  // real "0 assigned" is meaningful, not an omission).
  for (const uid of agentNames.keys()) {
    if (!byAgent.has(uid)) byAgent.set(uid, { assigned: 0, completed: 0, pending: 0, cancelled: 0 });
  }

  const performance: AgentPerformance[] = [...byAgent.entries()].map(([uid, stats]) => ({
    uid,
    name: agentNames.get(uid) ?? uid,
    ...stats,
    completionRate: stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0,
  }));

  return { performance, truncated: bookingsSnap.size === 2000 };
});

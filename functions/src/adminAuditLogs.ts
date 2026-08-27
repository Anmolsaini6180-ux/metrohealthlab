import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { getCallerClaims } from "./roleClaims";

interface GetAuditLogsInput {
  startDate: string;
  endDate: string;
  filterActorId?: string;
  filterAction?: string;
  filterTargetType?: string;
}

const MAX_RESULTS = 300;

// SUPER_ADMIN sees every audit log. Lower roles only see logs whose
// actor is within their own team (their own actions, or actions by
// staff in their downward hierarchy) — checked against the same
// denormalized chain fields used everywhere else, via a small lookup
// of the actor's own user doc per candidate log. Not a Firestore
// `where` filter (auditLogs doesn't carry the actor's hierarchy chain
// itself, only actorId) — so this fetches a bounded, date-ranged page
// and filters server-side rather than trusting any client-side filter.
export const getAuditLogs = onCall<GetAuditLogsInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (caller.role !== "SUPER_ADMIN" && caller.role !== "ADMIN" && caller.role !== "SUB_ADMIN") {
    throw new HttpsError("permission-denied", "Not authorized to view audit logs.");
  }
  const callerUid = request.auth!.uid;
  const input = request.data;
  if (!input?.startDate || !input.endDate) {
    throw new HttpsError("invalid-argument", "startDate and endDate are required.");
  }

  let q: FirebaseFirestore.Query = db.collection("auditLogs");
  if (input.filterAction) q = q.where("action", "==", input.filterAction);
  if (input.filterTargetType) q = q.where("targetType", "==", input.filterTargetType);
  if (input.filterActorId) q = q.where("actorId", "==", input.filterActorId);

  const startTs = new Date(`${input.startDate}T00:00:00`);
  const endTs = new Date(`${input.endDate}T23:59:59.999`);
  q = q.where("createdAt", ">=", startTs).where("createdAt", "<=", endTs).orderBy("createdAt", "desc").limit(MAX_RESULTS);

  const snap = await q.get();
  let logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (caller.role !== "SUPER_ADMIN") {
    const chainField = caller.role === "ADMIN" ? "adminId" : "subAdminId";
    const actorIds = [...new Set(logs.map((l) => (l as Record<string, unknown>).actorId).filter(Boolean))] as string[];
    const inScope = new Set<string>([callerUid]); // always see your own actions
    for (let i = 0; i < actorIds.length; i += 30) {
      const batch = actorIds.slice(i, i + 30);
      if (batch.length === 0) continue;
      const usersSnap = await db.collection("users").where("__name__", "in", batch).get();
      for (const doc of usersSnap.docs) {
        if (doc.data()[chainField] === callerUid) inScope.add(doc.id);
      }
    }
    logs = logs.filter((l) => inScope.has((l as Record<string, unknown>).actorId as string));
  }

  return { logs, truncated: snap.size === MAX_RESULTS };
});

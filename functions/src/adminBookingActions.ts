import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { writeNotification } from "./notifications";
import { writeAuditLog } from "./audit";
import { getCallerClaims } from "./roleClaims";

type BookingStatus =
  | "payment_pending"
  | "confirmed"
  | "assigned"
  | "on_the_way"
  | "arrived"
  | "sample_collected"
  | "received_at_lab"
  | "testing"
  | "report_ready"
  | "completed"
  | "cancelled"
  | "refunded";

const PRIVILEGED_ROLES = ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];

interface AssignBookingInput {
  bookingId: string;
  agentUid: string;
}

// Only SUPER_ADMIN/ADMIN/SUB_ADMIN can assign, and only to a
// COLLECTION_AGENT actually inside their own team — an ADMIN can never
// assign work using another ADMIN's agent, even by guessing a uid.
export const assignBooking = onCall<AssignBookingInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role || !PRIVILEGED_ROLES.includes(caller.role)) {
    throw new HttpsError("permission-denied", "Not authorized to assign bookings.");
  }
  const callerUid = request.auth!.uid;
  const { bookingId, agentUid } = request.data;
  if (!bookingId || !agentUid) throw new HttpsError("invalid-argument", "Missing fields.");

  const agentSnap = await db.collection("users").doc(agentUid).get();
  if (!agentSnap.exists || agentSnap.data()?.role !== "COLLECTION_AGENT") {
    throw new HttpsError("invalid-argument", "Target is not a collection agent.");
  }
  const agent = agentSnap.data()!;

  const authorized =
    caller.role === "SUPER_ADMIN" ||
    (caller.role === "ADMIN" && agent.adminId === callerUid) ||
    (caller.role === "SUB_ADMIN" && agent.subAdminId === callerUid);
  if (!authorized) {
    throw new HttpsError("permission-denied", "This collection agent isn't in your team.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) throw new HttpsError("not-found", "Booking not found.");
    const booking = snap.data()!;
    if (booking.bookingStatus !== "confirmed") {
      throw new HttpsError("failed-precondition", "Only confirmed bookings can be assigned.");
    }

    tx.update(bookingRef, {
      assignedAgentId: agentUid,
      assignedSubAdminId: agent.subAdminId ?? null,
      assignedAdminId: agent.adminId ?? null,
      bookingStatus: "assigned" as BookingStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection("bookingStatusHistory").doc(), {
      bookingId,
      status: "assigned",
      createdAt: FieldValue.serverTimestamp(),
    });
    writeNotification(tx, {
      userId: booking.userId,
      type: "collector_assigned",
      title: "Collector assigned",
      message: `A collector has been assigned to your booking ${bookingId}.`,
    });
    writeAuditLog(tx, {
      action: "booking.assigned",
      actorType: "staff",
      actorId: callerUid,
      targetType: "booking",
      targetId: bookingId,
      metadata: { agentUid },
    });
  });

  return { ok: true };
});

const FORWARD_SEQUENCE: BookingStatus[] = [
  "assigned",
  "on_the_way",
  "arrived",
  "sample_collected",
  "received_at_lab",
  "testing",
  "report_ready",
  "completed",
];

const NOTIFICATION_FOR_STATUS: Partial<
  Record<BookingStatus, { type: string; title: string; message: (id: string) => string }>
> = {
  on_the_way: { type: "on_the_way", title: "Collector on the way", message: (id) => `Your collector is on the way for booking ${id}.` },
  sample_collected: { type: "sample_collected", title: "Sample collected", message: (id) => `Your sample has been collected for booking ${id}.` },
  report_ready: { type: "report_ready", title: "Report ready", message: (id) => `Your report for booking ${id} is ready.` },
  cancelled: { type: "cancelled", title: "Booking cancelled", message: (id) => `Booking ${id} has been cancelled.` },
  refunded: { type: "refund", title: "Refund processed", message: (id) => `A refund has been processed for booking ${id}.` },
};

interface UpdateBookingStatusInput {
  bookingId: string;
  status: BookingStatus;
  note?: string;
}

// The single function every operational status change goes through —
// used by both the Collection Agent app (their own assigned bookings
// only) and admin staff (cancel/refund). Enforces a strict forward-only
// sequence so a status can never be skipped or moved backward, and every
// change is what makes the customer's realtime tracking page update —
// nothing else writes bookingStatus.
export const updateBookingStatus = onCall<UpdateBookingStatusInput>(async (request) => {
  const caller = getCallerClaims(request);
  if (!caller.role) throw new HttpsError("permission-denied", "Not an authorized staff account.");

  const callerUid = request.auth!.uid;
  const { bookingId, status, note } = request.data;
  if (!bookingId || !status) throw new HttpsError("invalid-argument", "Missing fields.");

  const bookingRef = db.collection("bookings").doc(bookingId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) throw new HttpsError("not-found", "Booking not found.");
    const booking = snap.data()!;

    const isAssignedAgent = caller.role === "COLLECTION_AGENT" && booking.assignedAgentId === callerUid;
    const isPrivileged = PRIVILEGED_ROLES.includes(caller.role!);
    if (!isAssignedAgent && !isPrivileged) {
      throw new HttpsError("permission-denied", "You're not assigned to this booking.");
    }

    if (status === "cancelled" || status === "refunded") {
      if (!isPrivileged) throw new HttpsError("permission-denied", "Only admin staff can cancel or process a refund.");
    } else {
      const currentIdx = FORWARD_SEQUENCE.indexOf(booking.bookingStatus as BookingStatus);
      const nextIdx = FORWARD_SEQUENCE.indexOf(status);
      if (nextIdx === -1 || nextIdx !== currentIdx + 1) {
        throw new HttpsError("failed-precondition", `Cannot move a booking from ${booking.bookingStatus} to ${status}.`);
      }
    }

    tx.update(bookingRef, { bookingStatus: status, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection("bookingStatusHistory").doc(), {
      bookingId,
      status,
      note: note ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    const notif = NOTIFICATION_FOR_STATUS[status];
    if (notif) {
      writeNotification(tx, {
        userId: booking.userId,
        type: notif.type as Parameters<typeof writeNotification>[1]["type"],
        title: notif.title,
        message: notif.message(bookingId),
      });
    }

    writeAuditLog(tx, {
      action: "booking.status_changed",
      actorType: "staff",
      actorId: callerUid,
      targetType: "booking",
      targetId: bookingId,
      metadata: { from: booking.bookingStatus, to: status },
    });
  });

  return { ok: true };
});

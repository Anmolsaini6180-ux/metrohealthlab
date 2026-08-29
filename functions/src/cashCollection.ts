import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { requireBookingStaff } from "./callerRole";
import { applyCashReceived, assertCollectable } from "./cashPayment";
import { isBookingStatus, isTerminal, type BookingStatus } from "./bookingStatus";
import { writeAuditLog } from "./audit";

interface RecordCashInput {
  bookingId: string;
  /** New cumulative total collected, in whole rupees. */
  amountReceived: number;
  note?: string;
}

// Staff records the cash a collector actually took.
//
// The booking's finalAmount is read from the stored document inside the
// transaction — never from the request — so a caller cannot inflate the
// bill, and cannot mark a booking paid by sending a number that happens
// to match. The client supplies only which booking and how much cash.
export const recordCashReceived = onCall<RecordCashInput>(async (request) => {
  const { uid } = await requireBookingStaff(request.auth);
  const { bookingId, amountReceived, note } = request.data ?? {};

  if (typeof bookingId !== "string" || !bookingId) {
    throw new HttpsError("invalid-argument", "A booking id is required.");
  }
  if (typeof amountReceived !== "number") {
    throw new HttpsError("invalid-argument", "Amount received must be a number.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That booking no longer exists.");
    const booking = snap.data()!;

    const status = booking.bookingStatus as BookingStatus;
    assertCollectable(status);

    const finalAmount = booking.finalAmount as number;
    const next = applyCashReceived(finalAmount, amountReceived);

    tx.update(bookingRef, {
      amountReceived: next.amountReceived,
      pendingAmount: next.pendingAmount,
      paymentStatus: next.paymentStatus,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Money movements are always auditable, including the value before
    // the change, so a correction can be told apart from a fresh
    // collection later.
    writeAuditLog(tx, {
      action: "booking.cash_recorded",
      actorType: "staff",
      actorId: uid,
      targetType: "booking",
      targetId: bookingId,
      metadata: {
        previousAmountReceived: (booking.amountReceived as number) ?? 0,
        amountReceived: next.amountReceived,
        pendingAmount: next.pendingAmount,
        paymentStatus: next.paymentStatus,
        ...(note ? { note: String(note).slice(0, 500) } : {}),
      },
    });

    return next;
  });

  return { ok: true as const, ...result };
});

/** Statuses an operator may set directly from the booking detail screen. */
const DIRECTLY_SETTABLE: BookingStatus[] = ["confirmed", "completed", "cancelled"];

interface SetStatusInput {
  bookingId: string;
  status: BookingStatus;
  note?: string;
}

// The three actions the admin booking detail exposes: confirm, mark
// completed, cancel. Kept separate from the operational
// updateBookingStatus sequence (collector on the way, sample collected,
// ...) because those belong to the agent app's forward-only flow.
export const setBookingStatus = onCall<SetStatusInput>(async (request) => {
  const { uid } = await requireBookingStaff(request.auth);
  const { bookingId, status, note } = request.data ?? {};

  if (typeof bookingId !== "string" || !bookingId) {
    throw new HttpsError("invalid-argument", "A booking id is required.");
  }
  if (!isBookingStatus(status) || !DIRECTLY_SETTABLE.includes(status)) {
    throw new HttpsError("invalid-argument", "That status cannot be set from here.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) throw new HttpsError("not-found", "That booking no longer exists.");
    const booking = snap.data()!;
    const current = booking.bookingStatus as BookingStatus;

    if (current === status) return;

    // A finished booking does not quietly reopen; reversing one is a
    // deliberate act that does not belong behind a list-row button.
    if (isTerminal(current)) {
      throw new HttpsError(
        "failed-precondition",
        `This booking is already ${current} and cannot be changed from here.`
      );
    }

    tx.update(bookingRef, {
      bookingStatus: status,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(db.collection("bookingStatusHistory").doc(), {
      bookingId,
      status,
      ...(note ? { note: String(note).slice(0, 500) } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });

    writeAuditLog(tx, {
      action: "booking.status_set",
      actorType: "staff",
      actorId: uid,
      targetType: "booking",
      targetId: bookingId,
      metadata: { from: current, to: status },
    });
  });

  return { ok: true as const };
});

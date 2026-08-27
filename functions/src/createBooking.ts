import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { calculateFinalAmount } from "./pricing";
import { generateBookingId } from "./bookingId";
import { evaluateCoupon, recordCouponUsage } from "./coupons";
import { resolveItems, resolveServiceArea, verifyPatientOwnership, verifyAddressOwnership, type ItemInput } from "./bookingResolution";
import { writeNotification } from "./notifications";
import { writeAuditLog } from "./audit";

interface CreateBookingInput {
  patientId: string;
  items: ItemInput[];
  labId: string;
  collectionType: "home" | "center";
  addressId?: string;
  pincode: string; // the pincode serviceability was checked against on the client — re-validated here
  date: string;
  slotId: string;
  couponCode?: string;
  paymentMethod: "upi" | "card" | "netbanking" | "wallet" | "cash_on_collection";
  // Client-generated once per booking attempt (crypto.randomUUID()) and
  // reused across retries of the *same* attempt so we never create two
  // bookings for one user action.
  idempotencyKey: string;
  // Purely informational — links the booking to the quote the customer
  // saw, for audit/support purposes. NEVER used for pricing or trust:
  // every field below is recomputed from scratch regardless of whether
  // this is present, missing, or doesn't match anything.
  quoteId?: string;
}

interface CreateBookingResult {
  bookingId: string;
  finalAmount: number;
}

export const createBooking = onCall<CreateBookingInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to book.");

  const input = request.data;
  if (
    !input?.patientId ||
    !input.items?.length ||
    !input.slotId ||
    !input.labId ||
    !input.pincode ||
    !input.date ||
    !input.idempotencyKey
  ) {
    throw new HttpsError("invalid-argument", "Missing required booking fields.");
  }
  if (input.collectionType === "home" && !input.addressId) {
    throw new HttpsError("invalid-argument", "An address is required for home collection.");
  }
  const requestedDate = new Date(`${input.date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(requestedDate.getTime()) || requestedDate < today) {
    throw new HttpsError("invalid-argument", "Invalid booking date.");
  }

  await verifyPatientOwnership(uid, input.patientId);
  if (input.addressId) {
    const addressPincode = await verifyAddressOwnership(uid, input.addressId);
    if (addressPincode !== input.pincode) {
      throw new HttpsError("invalid-argument", "Address pincode doesn't match the serviceability check.");
    }
  }

  const result = await db.runTransaction<CreateBookingResult>(async (tx) => {
    // ---- Idempotency: replay of an earlier attempt returns the same result ----
    const requestRef = db.collection("bookingRequests").doc(input.idempotencyKey);
    const existingRequest = await tx.get(requestRef);
    if (existingRequest.exists) {
      const prior = existingRequest.data()!;
      return { bookingId: prior.bookingId as string, finalAmount: prior.finalAmount as number };
    }

    // ---- Pricing + area: identical resolution logic getBookingQuote used ----
    const { subtotal, resolvedItems } = await resolveItems(tx, {
      labId: input.labId,
      items: input.items,
      collectionType: input.collectionType,
    });
    const { areaDoc, collectionFee } = await resolveServiceArea(tx, {
      pincode: input.pincode,
      collectionType: input.collectionType,
    });

    // ---- Slot: exists, active, matches date/type/area, has capacity ----
    const slotRef = db.collection("slots").doc(input.slotId);
    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists) throw new HttpsError("not-found", "Slot not found.");
    const slot = slotSnap.data()!;
    if (!slot.active) throw new HttpsError("failed-precondition", "This slot is no longer active.");
    if (slot.date !== input.date) throw new HttpsError("failed-precondition", "Slot date mismatch.");
    if (slot.collectionType !== input.collectionType) {
      throw new HttpsError("failed-precondition", "Slot collection type mismatch.");
    }
    if (slot.areaId !== areaDoc.id) {
      throw new HttpsError("failed-precondition", "Slot doesn't belong to the serviced area for this pincode.");
    }
    if (slot.bookedCount >= slot.capacity) {
      throw new HttpsError("failed-precondition", "This slot is fully booked. Please pick another.");
    }

    // ---- Coupon: fully validated server-side, hard failure (not silently dropped) ----
    let discount = 0;
    let couponId: string | undefined;
    if (input.couponCode) {
      const evaluation = await evaluateCoupon(tx, {
        couponCode: input.couponCode,
        uid,
        baseAmount: subtotal + collectionFee,
        labId: input.labId,
        items: input.items.map((i) => ({ itemType: i.itemType, refId: i.refId })),
      });
      discount = evaluation.discount;
      couponId = evaluation.couponDoc.id;
      recordCouponUsage(tx, evaluation, uid);
    }

    const finalAmount = calculateFinalAmount({ subtotal, collectionFee, discount });
    const bookingId = await generateBookingId(tx, new Date());
    const bookingRef = db.collection("bookings").doc(bookingId);

    // Every booking starts here regardless of payment method —
    // createPaymentOrder is what moves cash-on-collection straight to
    // "confirmed", and the Razorpay webhook is what moves online
    // payments to "confirmed" once payment is verified.
    tx.set(bookingRef, {
      userId: uid,
      patientId: input.patientId,
      items: resolvedItems,
      labId: input.labId,
      collectionType: input.collectionType,
      addressId: input.addressId ?? null,
      date: input.date,
      slotId: input.slotId,
      couponId: couponId ?? null,
      subtotal,
      collectionFee,
      discount,
      finalAmount,
      paymentStatus: "pending",
      bookingStatus: "payment_pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(slotRef, { bookedCount: FieldValue.increment(1) });

    tx.set(db.collection("bookingStatusHistory").doc(), {
      bookingId,
      status: "payment_pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    writeNotification(tx, {
      userId: uid,
      type: "booking_received",
      title: "Booking received",
      message: `We've received your booking ${bookingId}. Complete payment to confirm it.`,
    });

    writeAuditLog(tx, {
      action: "booking.created",
      actorType: "customer",
      actorId: uid,
      targetType: "booking",
      targetId: bookingId,
      metadata: { finalAmount, paymentMethod: input.paymentMethod, couponId: couponId ?? null, quoteId: input.quoteId ?? null },
    });

    tx.set(requestRef, {
      bookingId,
      finalAmount,
      userId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { bookingId, finalAmount };
  });

  return result;
});

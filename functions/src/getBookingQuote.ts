import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { calculateFinalAmount } from "./pricing";
import { resolveItems, resolveServiceArea, verifyPatientOwnership, verifyAddressOwnership, type ItemInput } from "./bookingResolution";
import { evaluateCoupon } from "./coupons";

interface GetBookingQuoteInput {
  patientId: string;
  items: ItemInput[];
  labId: string;
  collectionType: "home" | "center";
  addressId?: string;
  pincode: string;
  couponCode?: string;
}

interface GetBookingQuoteResponse {
  quoteId: string;
  subtotal: number;
  collectionFee: number;
  discount: number;
  finalAmount: number;
  currency: "INR";
  couponApplied: boolean;
  couponMessage?: string;
  expiresAt: string;
}

const QUOTE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// The authoritative price the review screen must display. Computed from
// the exact same trusted Firestore reads createBooking itself uses
// (resolveItems/resolveServiceArea/evaluateCoupon) — never independently
// recalculated on the frontend. This function only READS and records a
// quote for reference; it never reserves a slot, never records coupon
// usage, and createBooking never trusts quoteId or any value here — it
// always recomputes everything itself from scratch.
export const getBookingQuote = onCall<GetBookingQuoteInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

  const input = request.data;
  if (!input?.patientId || !input.items?.length || !input.labId || !input.pincode) {
    throw new HttpsError("invalid-argument", "Missing required quote fields.");
  }
  if (input.collectionType === "home" && !input.addressId) {
    throw new HttpsError("invalid-argument", "An address is required for home collection.");
  }

  await verifyPatientOwnership(uid, input.patientId);
  if (input.addressId) {
    const addressPincode = await verifyAddressOwnership(uid, input.addressId);
    if (addressPincode !== input.pincode) {
      throw new HttpsError("invalid-argument", "Address pincode doesn't match the serviceability check.");
    }
  }

  return db.runTransaction<GetBookingQuoteResponse>(async (tx) => {
    const { subtotal, resolvedItems } = await resolveItems(tx, {
      labId: input.labId,
      items: input.items,
      collectionType: input.collectionType,
    });
    const { collectionFee } = await resolveServiceArea(tx, {
      pincode: input.pincode,
      collectionType: input.collectionType,
    });

    let discount = 0;
    let couponApplied = false;
    let couponMessage: string | undefined;
    if (input.couponCode) {
      try {
        const evaluation = await evaluateCoupon(tx, {
          couponCode: input.couponCode,
          uid,
          baseAmount: subtotal + collectionFee,
          labId: input.labId,
          items: input.items.map((i) => ({ itemType: i.itemType, refId: i.refId })),
        });
        discount = evaluation.discount;
        couponApplied = true;
        // Deliberately NOT calling recordCouponUsage — this is a
        // preview. Usage is only ever recorded inside createBooking.
      } catch (err) {
        couponMessage = err instanceof HttpsError ? err.message : "This coupon couldn't be validated.";
      }
    }

    const finalAmount = calculateFinalAmount({ subtotal, collectionFee, discount });
    const expiresAt = Date.now() + QUOTE_TTL_MS;

    const quoteRef = db.collection("priceQuotes").doc();
    tx.set(quoteRef, {
      userId: uid,
      patientId: input.patientId,
      items: resolvedItems,
      labId: input.labId,
      collectionType: input.collectionType,
      addressId: input.addressId ?? null,
      pincode: input.pincode,
      couponCode: input.couponCode ?? null,
      subtotal,
      collectionFee,
      discount,
      finalAmount,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(expiresAt),
    });

    return {
      quoteId: quoteRef.id,
      subtotal,
      collectionFee,
      discount,
      finalAmount,
      currency: "INR",
      couponApplied,
      couponMessage,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  });
});

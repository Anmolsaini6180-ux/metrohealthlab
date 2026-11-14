import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, type DocumentReference, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";
import { computeCouponDiscount } from "./pricing";

interface CouponCheckInput {
  couponCode: string;
  uid: string;
  baseAmount: number; // subtotal + collectionFee — the amount discount applies against
  labId: string;
  items: { itemType: "test" | "package"; refId: string }[];
}

export interface CouponEvaluation {
  couponDoc: QueryDocumentSnapshot;
  discount: number;
  usageRef: DocumentReference;
  perUserCount: number;
}

// Read-only: validates a coupon and computes its discount without
// recording any usage. Used by both getBookingQuote (preview — never
// records usage) and createBooking (which calls this THEN
// recordCouponUsage, only once the rest of the booking is also valid).
// Throws HttpsError on any problem — callers decide whether that's a
// hard failure (createBooking) or something to report gently
// (getBookingQuote).
export async function evaluateCoupon(tx: Transaction, input: CouponCheckInput): Promise<CouponEvaluation> {
  const couponQuery = await tx.get(
    db.collection("coupons").where("code", "==", input.couponCode.trim().toUpperCase()).limit(1)
  );
  if (couponQuery.empty) {
    throw new HttpsError("failed-precondition", "This coupon code doesn't exist.");
  }
  const couponDoc = couponQuery.docs[0];
  const coupon = couponDoc.data();

  if (!coupon.active) {
    throw new HttpsError("failed-precondition", "This coupon is no longer active.");
  }

  const now = new Date();
  if (now < new Date(coupon.startDate)) {
    throw new HttpsError("failed-precondition", "This coupon isn't active yet.");
  }
  if (now > new Date(coupon.expiryDate)) {
    throw new HttpsError("failed-precondition", "This coupon has expired.");
  }
  if (coupon.minimumOrder && input.baseAmount < coupon.minimumOrder) {
    throw new HttpsError("failed-precondition", `This coupon needs a minimum order of ${coupon.minimumOrder}.`);
  }

  if (coupon.applicableLabs?.length && !coupon.applicableLabs.includes(input.labId)) {
    throw new HttpsError("failed-precondition", "This coupon isn't valid for the selected lab.");
  }
  if (coupon.applicableTests?.length || coupon.applicablePackages?.length) {
    const itemsMatch = input.items.every((item) =>
      item.itemType === "test"
        ? coupon.applicableTests?.includes(item.refId)
        : coupon.applicablePackages?.includes(item.refId)
    );
    if (!itemsMatch) {
      throw new HttpsError("failed-precondition", "This coupon doesn't apply to the items in this booking.");
    }
  }

  const usedCount = (coupon.usedCount as number | undefined) ?? 0;
  if (coupon.usageLimit != null && usedCount >= coupon.usageLimit) {
    throw new HttpsError("failed-precondition", "This coupon has reached its usage limit.");
  }

  const usageRef = db.collection("couponUsage").doc(`${couponDoc.id}_${input.uid}`);
  const usageSnap = await tx.get(usageRef);
  const perUserCount = usageSnap.exists ? (usageSnap.data()!.count as number) : 0;
  if (coupon.perUserLimit != null && perUserCount >= coupon.perUserLimit) {
    throw new HttpsError("failed-precondition", "You've already used this coupon the maximum number of times.");
  }
  if (coupon.firstOrderOnly && perUserCount > 0) {
    throw new HttpsError("failed-precondition", "This coupon is only valid on your first order.");
  }

  const discount = computeCouponDiscount(
    { discountType: coupon.discountType, discountValue: coupon.discountValue, maximumDiscount: coupon.maximumDiscount },
    input.baseAmount
  );

  return { couponDoc, discount, usageRef, perUserCount };
}

// Writes usage — only ever called after evaluateCoupon has succeeded
// AND the caller has decided to actually go through with recording it
// (createBooking, right before it commits the booking). Reads that
// could invalidate the coupon (usedCount, perUserCount) were already
// done inside this same transaction by evaluateCoupon, so Firestore
// aborts/retries the whole transaction if another concurrent booking
// changes them first — usedCount can never be pushed past usageLimit.
export function recordCouponUsage(tx: Transaction, evaluation: CouponEvaluation, uid: string): void {
  tx.set(
    evaluation.usageRef,
    { couponId: evaluation.couponDoc.id, userId: uid, count: evaluation.perUserCount + 1 },
    { merge: true }
  );
  tx.update(evaluation.couponDoc.ref, { usedCount: FieldValue.increment(1) });
}

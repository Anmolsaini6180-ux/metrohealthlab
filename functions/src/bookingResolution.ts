import { HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "./admin";

export interface ItemInput {
  itemType: "test" | "package";
  refId: string;
  name: string;
}

export interface ResolvedItem {
  itemType: "test" | "package";
  refId: string;
  name: string;
  labId: string;
  price: number;
}

// Shared by getBookingQuote and createBooking so a quote and the
// booking it led to can never silently disagree — both call the exact
// same resolution logic against the exact same trusted Firestore data,
// inside their own transaction.
export async function resolveItems(
  tx: Transaction,
  params: { labId: string; items: ItemInput[]; collectionType: "home" | "center" }
): Promise<{ subtotal: number; resolvedItems: ResolvedItem[] }> {
  const labSnap = await tx.get(db.collection("labs").doc(params.labId));
  if (!labSnap.exists || !labSnap.data()?.active) {
    throw new HttpsError("failed-precondition", "This lab is currently unavailable.");
  }

  let subtotal = 0;
  const resolvedItems: ResolvedItem[] = [];
  for (const item of params.items) {
    const catalogCollection = item.itemType === "test" ? "tests" : "packages";
    const catalogSnap = await tx.get(db.collection(catalogCollection).doc(item.refId));
    if (!catalogSnap.exists || !catalogSnap.data()?.active) {
      throw new HttpsError("failed-precondition", `${item.name} is no longer available.`);
    }
    const catalogData = catalogSnap.data()!;
    if (!(catalogData.labIds as string[] | undefined)?.includes(params.labId)) {
      throw new HttpsError("failed-precondition", `${item.name} isn't offered by the selected lab.`);
    }

    const pricingQuery = await tx.get(
      db
        .collection("labPricing")
        .where("labId", "==", params.labId)
        .where(item.itemType === "test" ? "testId" : "packageId", "==", item.refId)
        .where("active", "==", true)
        .limit(1)
    );
    if (pricingQuery.empty) {
      throw new HttpsError("failed-precondition", `${item.name} is no longer available from this lab.`);
    }
    const pricing = pricingQuery.docs[0].data();
    if (pricing.collectionType !== "both" && pricing.collectionType !== params.collectionType) {
      throw new HttpsError(
        "failed-precondition",
        `${item.name} at this lab doesn't support ${params.collectionType} collection.`
      );
    }

    const price = pricing.price as number;
    subtotal += price;
    resolvedItems.push({ itemType: item.itemType, refId: item.refId, name: item.name, labId: params.labId, price });
  }

  return { subtotal, resolvedItems };
}

export async function resolveServiceArea(
  tx: Transaction,
  params: { pincode: string; collectionType: "home" | "center" }
) {
  const areaQuery = await tx.get(
    db.collection("serviceAreas").where("pincode", "==", params.pincode).where("active", "==", true).limit(1)
  );
  if (areaQuery.empty) {
    throw new HttpsError("failed-precondition", "This pincode isn't serviceable.");
  }
  const areaDoc = areaQuery.docs[0];
  const area = areaDoc.data();
  if (params.collectionType === "home" && !area.homeCollectionAvailable) {
    throw new HttpsError("failed-precondition", "Home collection isn't available in this area.");
  }
  const collectionFee = params.collectionType === "home" ? (area.collectionFee as number) : 0;
  return { areaDoc, area, collectionFee };
}

export async function verifyPatientOwnership(uid: string, patientId: string): Promise<void> {
  const snap = await db.collection("patients").doc(patientId).get();
  if (!snap.exists || snap.data()?.userId !== uid) {
    throw new HttpsError("permission-denied", "Invalid patient.");
  }
}

// Returns the address's pincode so callers can cross-check it against
// whatever pincode the serviceability check was run against.
export async function verifyAddressOwnership(uid: string, addressId: string): Promise<string> {
  const snap = await db.collection("addresses").doc(addressId).get();
  if (!snap.exists || snap.data()?.userId !== uid) {
    throw new HttpsError("permission-denied", "Invalid address.");
  }
  return snap.data()?.pincode as string;
}

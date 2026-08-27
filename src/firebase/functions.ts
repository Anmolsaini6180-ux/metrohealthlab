import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { getFirebaseApp } from "./config";

let functionsInstance: Functions | null = null;

export function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(getFirebaseApp());
  }
  return functionsInstance;
}

// Thin wrapper around httpsCallable so services don't each re-import
// firebase/functions. All server-trusted operations (booking creation,
// price validation, payment order creation, coupon application, report
// URLs) MUST go through Cloud Functions like this rather than writing
// Firestore directly from the client — see /functions/README.md.
export async function callFunction<Req extends object, Res>(
  name: string,
  payload: Req
): Promise<Res> {
  const callable = httpsCallable<Req, Res>(getFunctionsInstance(), name);
  const result = await callable(payload);
  return result.data;
}

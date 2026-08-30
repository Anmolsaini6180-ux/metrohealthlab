import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { UserProfile } from "@/types/user";
import type { User } from "firebase/auth";

const USERS = "users";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getDb(), USERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as UserProfile;
}

// Called right after first sign-in so every authenticated user has a
// users/{uid} profile doc to hang patients/addresses/bookings off of.
//
// KNOWN RACE, FIXED: AuthProvider's onAuthStateChanged handler calls
// this on every sign-in, including the very same sign-in
// registerAndLoginWithEmail just performed — the two calls run
// concurrently. Previously, registerAndLoginWithEmail called this
// function (which writes only Firebase-derived fields) and THEN a
// separate updateUserProfile(name/phone) call — an updateDoc(), which
// requires the document to already exist. If AuthProvider's own
// concurrent ensureUserProfile() had not yet created it, that update
// failed outright ("permission-denied"/not-found, observed in
// production). Two fixes together close this:
//   1. extraFields lets a caller that already knows name/phone (i.e.
//      registerAndLoginWithEmail) include them in THIS SAME creating
//      write, removing the separate racy update entirely.
//   2. setDoc(..., { merge: true }) makes a second, concurrent call
//      (AuthProvider's own, with no extra fields) safe regardless of
//      ordering: merge never clears a field the other call already
//      wrote, so whichever of the two writes lands second cannot
//      erase what the first one set.
export async function ensureUserProfile(
  user: User,
  extraFields?: Partial<Pick<UserProfile, "name" | "phone">>
): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing && !extraFields) return existing;

  // Firestore's setDoc() rejects any field explicitly set to
  // `undefined` (unlike `null`, which is fine) — a Google account
  // with no phone number, or an email/password signup with no
  // displayName, would otherwise crash this write entirely. Only
  // include a key when there's an actual value.
  const profile: Partial<Omit<UserProfile, "id">> = {
    ...(existing ? {} : { accountType: "customer" as const, createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
    ...(user.displayName ? { name: user.displayName } : {}),
    ...(user.email ? { email: user.email } : {}),
    ...(user.phoneNumber ? { phone: user.phoneNumber } : {}),
    ...(user.photoURL ? { photoUrl: user.photoURL } : {}),
    // Explicit signup-form values win over whatever Firebase itself
    // carried (a Google account's displayName, for instance).
    ...(extraFields?.name ? { name: extraFields.name } : {}),
    ...(extraFields?.phone ? { phone: extraFields.phone } : {}),
  };
  await setDoc(doc(getDb(), USERS, user.uid), profile, { merge: true });
  return { id: user.uid, ...(existing ?? {}), ...profile } as UserProfile;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(getDb(), USERS, uid), { ...data, updatedAt: serverTimestamp() });
}

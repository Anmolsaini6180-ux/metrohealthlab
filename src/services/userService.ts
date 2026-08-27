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
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  // Firestore's setDoc() rejects any field explicitly set to
  // `undefined` (unlike `null`, which is fine) — a Google account
  // with no phone number, or an email/password signup with no
  // displayName, would otherwise crash this write entirely. Only
  // include a key when there's an actual value.
  const profile: Omit<UserProfile, "id"> = {
    accountType: "customer",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(user.displayName ? { name: user.displayName } : {}),
    ...(user.email ? { email: user.email } : {}),
    ...(user.phoneNumber ? { phone: user.phoneNumber } : {}),
    ...(user.photoURL ? { photoUrl: user.photoURL } : {}),
  };
  await setDoc(doc(getDb(), USERS, user.uid), profile);
  return { id: user.uid, ...profile };
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(getDb(), USERS, uid), { ...data, updatedAt: serverTimestamp() });
}

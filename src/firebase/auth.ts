import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseApp } from "./config";

// Phone OTP only — Google and email/password moved to Supabase Auth
// entirely (see src/supabase/auth.ts and authService.ts). This is the
// one thing kept here because Supabase has no free SMS provider.

let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

// Phone/OTP auth needs an invisible reCAPTCHA bound to a DOM node that
// exists when this is called — call from the login page after render.
export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(getFirebaseAuth(), containerId, {
    size: "invisible",
  });
}

export async function sendOtp(
  phoneNumberE164: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(getFirebaseAuth(), phoneNumberE164, verifier);
}

export async function confirmOtp(
  confirmation: ConfirmationResult,
  code: string
): Promise<User> {
  const result = await confirmation.confirm(code);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

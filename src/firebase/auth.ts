import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
  type ConfirmationResult,
} from "firebase/auth";

export interface GoogleSignInResult {
  user: User;
  /**
   * The Google-issued OIDC ID token from this same popup, when Firebase
   * exposes one. Firestore's rules only ever trust a Firebase ID token
   * (this sign-in provides that, unchanged), but this raw Google token
   * is ALSO usable to establish a Supabase session for the same
   * Google identity via supabase.auth.signInWithIdToken — one consent
   * screen, two sessions, no second popup/redirect. null when Firebase
   * did not return one (older/less common credential shapes); callers
   * must treat that as "Supabase linking unavailable this sign-in",
   * never as a sign-in failure.
   */
  googleIdToken: string | null;
}
import { getFirebaseApp } from "./config";

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

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return { user: result.user, googleIdToken: credential?.idToken ?? null };
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return result.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  return result.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
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

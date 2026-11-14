// Supabase Auth is now the canonical, only runtime session for
// email/password and Google — the identity that unlocks every piece of
// real data (bookings, patients, addresses, reports, notifications,
// profile) IS the session itself now, with no Firebase-uid bridge
// required for either of those two methods.
//
// WHY FIREBASE STILL EXISTS AT ALL: Phone OTP has no Supabase
// equivalent (no free SMS provider configured, and none will be
// fabricated) — Firebase Phone Auth is the one thing genuinely kept.
// A phone-only account normalizes to the same AppUser shape (see
// src/types/authUser.ts) so every consumer of useAuth().user reads the
// same five fields regardless of which provider actually authenticated
// the session; only `provider` tells them apart.
//
// Google's redirect (supabase.auth.signInWithOAuth) navigates the
// browser away immediately — there is no user to return from
// loginWithGoogle() the way a popup had one. useAuth.tsx's
// onAuthStateChange subscription is what actually observes the session
// once the browser comes back; callers must not expect a synchronous
// result from Google sign-in the way email/password still has.
import {
  createRecaptchaVerifier,
  sendOtp,
  confirmOtp,
  signOutUser as firebaseSignOutUser,
} from "@/firebase/auth";
import {
  signInWithGoogle as supabaseSignInWithGoogle,
  signInWithEmail as supabaseSignInWithEmail,
  registerWithEmail as supabaseRegisterWithEmail,
  resetPassword as supabaseResetPassword,
  signOutUser as supabaseSignOutUser,
} from "@/supabase/auth";
import { ensureUserProfile } from "./userService";
import { fromFirebasePhoneUser, fromSupabaseUser, type AppUser } from "@/types/authUser";

export { createRecaptchaVerifier, sendOtp };
export { updateUserPassword } from "@/supabase/auth";

/** Kicks off the redirect to Google. Resolves once the browser has
 * started navigating away (or throws immediately on a real
 * configuration/network failure) — it does NOT resolve with a signed-in
 * user. useAuth.tsx observes the actual sign-in after Google redirects
 * back. `redirectTo` should be the full destination URL (origin + the
 * path the caller wants to land on) so the user comes back exactly
 * where they meant to go, not always the homepage. */
export async function loginWithGoogle(redirectTo?: string): Promise<void> {
  await supabaseSignInWithGoogle(redirectTo);
}

export async function loginWithEmail(email: string, password: string): Promise<AppUser> {
  const user = await supabaseSignInWithEmail(email, password);
  return fromSupabaseUser(user);
}

/**
 * Signup has extra fields (name/phone from the form) to write
 * immediately. Returns null — instead of throwing — when Supabase
 * requires email confirmation before a session exists: the account was
 * genuinely created, there is just no one to log in as yet. Callers
 * must check for null and show a "check your email" state rather than
 * assuming a signup always ends signed in.
 */
export async function registerAndLoginWithEmail(
  email: string,
  password: string,
  profileFields?: { name?: string; phone?: string }
): Promise<AppUser | null> {
  const { user, session } = await supabaseRegisterWithEmail(email, password);
  if (!session) return null; // confirmation email sent; no session to act on yet

  const appUser = fromSupabaseUser(user);
  await ensureUserProfile(user.id, appUser, profileFields);
  return appUser;
}

export { supabaseResetPassword as resetPassword };

/** Phone sign-in stays Firebase-only, unchanged — this is the one path
 * that still produces a Firebase user, normalized to the same AppUser
 * shape every other sign-in method returns. */
export async function loginWithOtpConfirmation(
  confirmation: Parameters<typeof confirmOtp>[0],
  code: string
): Promise<AppUser> {
  const user = await confirmOtp(confirmation, code);
  return fromFirebasePhoneUser(user);
}

/** Signs out of both providers — harmless (a no-op, not an error) for
 * whichever one was never signed in, since exactly one is ever active
 * for a given session (Supabase for email/Google, Firebase for phone). */
export async function logout(): Promise<void> {
  await Promise.all([
    supabaseSignOutUser().catch((err) => console.error("[auth] Could not clear the Supabase session on logout:", err)),
    firebaseSignOutUser().catch((err) => console.error("[auth] Could not clear the Firebase session on logout:", err)),
  ]);
}

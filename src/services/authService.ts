// Thin convenience layer over firebase/auth.ts. Post-sign-in setup
// (profile creation, the owner auto-grant check, token refresh) is
// centralized in AuthProvider's onAuthStateChanged subscription — see
// useAuth.tsx — NOT duplicated here. Every one of Firebase's sign-in
// methods (Google, email, phone) fires the same onAuthStateChanged
// event, so AuthProvider's subscription already runs for all of them;
// calling ensureUserProfile again here would just be a second,
// redundant, potentially-racing code path doing the same setup.
import type { User } from "firebase/auth";
import { callFunction } from "@/firebase/functions";
import {
  confirmOtp,
  createRecaptchaVerifier,
  registerWithEmail,
  resetPassword,
  sendOtp,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
} from "@/firebase/auth";
import { ensureUserProfile, updateUserProfile } from "./userService";

export async function loginWithGoogle(): Promise<User> {
  return signInWithGoogle();
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  return signInWithEmail(email, password);
}

// Signup is the one exception that still needs its own ensureUserProfile
// call: it has extra fields (name/phone from the signup form) to write
// immediately, before anything else reads the profile back. AuthProvider's
// own call moments later is harmless — ensureUserProfile is idempotent,
// returning the already-created profile as-is rather than re-creating it.
export async function registerAndLoginWithEmail(
  email: string,
  password: string,
  profileFields?: { name?: string; phone?: string }
): Promise<User> {
  const user = await registerWithEmail(email, password);
  await ensureUserProfile(user);
  if (profileFields?.name || profileFields?.phone) {
    await updateUserProfile(user.uid, {
      ...(profileFields.name ? { name: profileFields.name } : {}),
      ...(profileFields.phone ? { phone: profileFields.phone } : {}),
    });
  }
  return user;
}

export { resetPassword };

// Resolves this account's staff role server-side and writes it into
// their Firebase Auth custom claims. Called once per sign-in and
// awaited before anything reads the ID token. Takes no arguments by
// design: the function looks only at the verified uid and email inside
// the caller's own token, so there is nothing for a client to forge.
//
// It is also what makes a role CHANGE or a REVOCATION take effect —
// the claim is rewritten (or stripped) to match whatever the server
// currently says, not whatever the old token happened to carry.
export async function syncMyRole(): Promise<{ role: string | null }> {
  return callFunction<Record<string, never>, { role: string | null }>("syncMyRole", {});
}

export { createRecaptchaVerifier, sendOtp };

export async function loginWithOtpConfirmation(
  confirmation: Parameters<typeof confirmOtp>[0],
  code: string
): Promise<User> {
  return confirmOtp(confirmation, code);
}

export { signOutUser as logout };

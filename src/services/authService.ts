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

export async function checkOwnerAutoGrant(): Promise<{ granted: boolean }> {
  return callFunction<Record<string, never>, { granted: boolean }>("checkOwnerAutoGrant", {});
}

export { createRecaptchaVerifier, sendOtp };

export async function loginWithOtpConfirmation(
  confirmation: Parameters<typeof confirmOtp>[0],
  code: string
): Promise<User> {
  return confirmOtp(confirmation, code);
}

export { signOutUser as logout };

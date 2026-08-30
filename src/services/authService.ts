// Thin convenience layer over firebase/auth.ts, now ALSO establishing
// a Supabase session alongside every Google/email sign-in — the Phase
// E auth cutover. Post-sign-in Firestore setup (profile creation,
// resolving the staff role) is centralized in AuthProvider's
// onAuthStateChanged subscription — see useAuth.tsx — NOT duplicated
// here.
//
// WHY BOTH PROVIDERS, STILL: Firestore's security rules only ever
// trust a genuine Firebase ID token, and Firestore data (bookings,
// patients, addresses, reports, notifications, the customer profile
// itself) is NOT migrated yet. So Firebase remains the session that
// actually unlocks the app's real data; Supabase supplies the SECOND
// session used only for authorization (SUPER_ADMIN/staff, via
// app_config/staff_roles — see src/supabase/roleService.ts).
//
// Every Supabase-linking step below is BEST EFFORT and never blocks or
// fails a sign-in that Firebase itself accepted: if Supabase is briefly
// unreachable, or a pre-cutover account has no Supabase password yet,
// the customer still gets a fully working session (Firestore access
// unaffected) — they simply resolve to "no staff role" until the
// Supabase side reconciles, which is the correct fail-closed behaviour
// for anyone who was not already an authorized admin.
//
// Google never links by email in OUR code — the email-based matching
// happens entirely inside Supabase's own signInWithIdToken (its
// documented identity-linking behaviour), which is what correctly
// reattaches to the account Phase D's migration pre-created. The
// AUTHORITATIVE mapping this app relies on is still profiles.firebase_uid,
// checked explicitly in resolveStaffContextForFirebaseUser.
import type { User } from "firebase/auth";
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
import {
  signInWithEmail as supabaseSignInWithEmail,
  signInWithGoogleIdToken,
  registerWithEmail as supabaseRegisterWithEmail,
  signOutUser as supabaseSignOutUser,
} from "@/supabase/auth";
import { getSupabaseClient } from "@/supabase/client";

/** Never throws — logs and returns, so the caller's Firebase-based
 * sign-in (the one that actually matters for Firestore access) is
 * never blocked by a Supabase hiccup. */
async function linkSupabaseSessionForGoogle(googleIdToken: string | null): Promise<void> {
  if (!googleIdToken) {
    console.warn("[auth] No Google ID token available from this sign-in; Supabase authorization link skipped.");
    return;
  }
  try {
    await signInWithGoogleIdToken(googleIdToken);
  } catch (err) {
    console.error("[auth] Could not establish a Supabase session for this Google sign-in:", err);
  }
}

async function linkSupabaseSessionForEmail(email: string, password: string): Promise<void> {
  try {
    await supabaseSignInWithEmail(email, password);
  } catch (err) {
    console.error("[auth] Could not establish a Supabase session for this email sign-in:", err);
  }
}

export async function loginWithGoogle(): Promise<User> {
  const { user, googleIdToken } = await signInWithGoogle();
  await linkSupabaseSessionForGoogle(googleIdToken);
  return user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const user = await signInWithEmail(email, password);
  await linkSupabaseSessionForEmail(email, password);
  return user;
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

  // Best effort, same non-blocking contract as sign-in: a brand new
  // account with no live Supabase counterpart yet is still a fully
  // working customer account (Firestore-backed), just with no staff
  // authority — correct, since a new signup is never staff.
  try {
    const supabaseUser = await supabaseRegisterWithEmail(email, password);
    // profiles_insert_self RLS allows exactly this: a freshly
    // authenticated Supabase user inserting their OWN row. No
    // service-role key involved anywhere in this path.
    const { error } = await getSupabaseClient()
      .from("profiles")
      .insert([
        {
          id: supabaseUser.id,
          firebase_uid: user.uid,
          ...(profileFields?.name ? { name: profileFields.name } : {}),
          ...(profileFields?.phone ? { phone: profileFields.phone } : {}),
          email,
        },
      ]);
    if (error) throw error;
  } catch (err) {
    console.error("[auth] Could not create a linked Supabase identity for this new account:", err);
  }

  return user;
}

export { resetPassword };

export { createRecaptchaVerifier, sendOtp };

export async function loginWithOtpConfirmation(
  confirmation: Parameters<typeof confirmOtp>[0],
  code: string
): Promise<User> {
  // Phone sign-in stays Firebase-only, unchanged. Supabase has no free
  // SMS provider (see src/supabase/phoneBridge.ts), so there is no
  // Supabase session to establish here — resolveStaffContextForFirebaseUser
  // correctly treats "no Supabase session" as "customer, no staff role",
  // which is the right answer: no phone-authenticated account is staff
  // today.
  return confirmOtp(confirmation, code);
}

export async function logout(): Promise<void> {
  await Promise.all([
    signOutUser(),
    supabaseSignOutUser().catch((err) => console.error("[auth] Could not clear the Supabase session on logout:", err)),
  ]);
}

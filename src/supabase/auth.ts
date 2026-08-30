import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

// Deliberately mirrors src/firebase/auth.ts's function names and
// shapes wherever the two SDKs genuinely correspond, so a future
// adapter/swap does not force every caller to be rewritten. Where the
// two libraries fundamentally differ (Supabase has no popup sign-in —
// only a hosted redirect, which is why Google goes through
// signInWithGoogleIdToken instead), that difference is real and is not
// papered over.
//
// Wired in from src/services/authService.ts as of the Phase E auth
// cutover. Firestore's rules only ever trust a genuine Firebase ID
// token, and Firestore data is not migrated yet, so Firebase remains
// the session that actually unlocks Firestore reads/writes; this
// module supplies the SECOND, Supabase-side session used for
// authorization (app_config/staff_roles), established alongside it.

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo ?? window.location.origin },
  });
  // A successful call navigates the browser away to Google immediately;
  // there is no user to return here the way signInWithPopup has one.
  // Failure (misconfigured provider, network) is the only case that
  // returns control to the caller.
  if (error) throw error;
}

/**
 * Exchanges a Google ID token (obtained from Firebase's own Google
 * popup — see firebase/auth.ts's signInWithGoogle) for a Supabase
 * session, WITHOUT a second consent screen or redirect. Supabase links
 * this to any existing auth.users row with the same verified email
 * (this is Supabase's own documented default identity-linking
 * behaviour) — which is exactly the account Phase D's migration
 * pre-created for each real Google user, so this resolves to the SAME
 * Supabase identity that already has the correct profiles.firebase_uid.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const { data, error } = await getSupabaseClient().auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error) throw error;
  return data.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await getSupabaseClient().auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) {
    // Only happens if email confirmation is required and Supabase
    // withholds the session/user until it is verified. Not an error —
    // the account was created — but callers must not assume a usable
    // session exists yet.
    throw new Error("Account created. Check your email to confirm before signing in.");
  }
  return data.user;
}

export async function resetPassword(email: string, redirectTo?: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function signOutUser(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

/**
 * Session restoration + live auth-state changes in one subscription —
 * onAuthStateChange fires once immediately with the restored session
 * (or null) on subscribe, then again on every sign-in/sign-out/token
 * refresh. This is the Supabase equivalent of Firebase's
 * onAuthStateChanged, and is meant to be called the same way: once,
 * from the same place useAuth.tsx currently calls
 * subscribeToAuthChanges.
 */
export function subscribeToAuthChanges(callback: (user: User | null, session: Session | null) => void): () => void {
  const {
    data: { subscription },
  } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null, session);
  });
  return () => subscription.unsubscribe();
}

/** One-shot read of the current session, for call sites that need a
 * synchronous-ish check rather than a subscription (e.g. a route guard
 * deciding whether to even mount the listener-based provider). */
export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

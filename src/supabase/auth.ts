import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

// The canonical auth implementation for email/password and Google —
// authService.ts calls straight into this module for both now, with no
// Firebase involved in either path. Phone OTP is the one thing that
// still goes through firebase/auth.ts instead (no Supabase SMS
// provider exists); everything below this comment is real, live
// runtime code, not a parallel implementation waiting to be wired in.

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

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** `session` is null exactly when Supabase requires email confirmation
 * before the account can sign in — the account is genuinely created
 * either way, there is just no one to act as yet. Never throws for
 * this case: it is an expected outcome, not a failure, and the caller
 * (authService.ts) is the one that decides what to show for it. */
export async function registerWithEmail(email: string, password: string): Promise<{ user: User; session: Session | null }> {
  const { data, error } = await getSupabaseClient().auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) {
    // Not documented to happen alongside a null error, but fail loudly
    // rather than silently return a user that doesn't exist.
    throw new Error("Signup did not return an account. Please try again.");
  }
  return { user: data.user, session: data.session };
}

/** Completes a password reset: called from ResetPasswordPage once the
 * recovery link has landed the browser back here with a live recovery
 * session (Supabase's client detects the token in the URL on load). */
export async function updateUserPassword(newPassword: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password: newPassword });
  if (error) throw error;
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

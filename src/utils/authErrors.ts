// Turns a raw Supabase Auth error into something a person can act on,
// while keeping the exact technical cause visible in the console.
//
// Sign-in has a lot of genuinely different failure modes — a wrong
// password, an unconfirmed email, the OAuth provider not enabled in
// the Supabase dashboard, the network dropping, RLS refusing the role
// lookup — and they all used to surface as one opaque string. That is
// what made a failed admin sign-in impossible to diagnose from the
// screen.
//
// This module changes only what is REPORTED. It never decides what is
// allowed: authorization is resolved from Supabase (app_config/
// staff_roles) and enforced by RLS regardless of what this returns.
//
// @supabase/supabase-js v2's AuthApiError carries a stable `.code`
// string on most failures; a plain network/CORS failure or an older
// SDK edge case has no `.code`, so `.message` substring matching is
// the fallback, not the primary path.

export type SignInFailure =
  | "cancelled"
  | "provider-config"
  | "invalid-credentials"
  | "email-not-confirmed"
  | "rate-limited"
  | "network"
  | "permission-denied"
  | "unavailable"
  | "unknown";

export interface SignInErrorInfo {
  failure: SignInFailure;
  /** Supabase's own error code, e.g. "invalid_credentials", or "unknown". Never a credential. */
  code: string;
  /** Safe to render in the UI. */
  message: string;
  /** The user aborted deliberately (closed the OAuth tab) — show no error at all. */
  silent: boolean;
}

function supabaseErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function describeSignInError(error: unknown): SignInErrorInfo {
  const code = supabaseErrorCode(error);
  const message = messageOf(error).toLowerCase();
  const at = (failure: SignInFailure, text: string, silent = false): SignInErrorInfo => ({
    failure,
    code: code || "unknown",
    message: text,
    silent,
  });

  switch (code) {
    case "invalid_credentials":
    case "invalid_grant":
      return at("invalid-credentials", "That email address and password don't match an account.");
    case "email_not_confirmed":
      return at("email-not-confirmed", "Confirm your email address first — check your inbox for the link we sent.");
    case "user_not_found":
      return at("invalid-credentials", "That email address and password don't match an account.");
    case "user_banned":
      return at("invalid-credentials", "This account has been disabled.");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return at("rate-limited", "Too many attempts. Wait a moment and try again.");
    case "provider_disabled":
    case "validation_failed":
      return at(
        "provider-config",
        "Google sign-in is not enabled for this project. Enable the Google provider in the Supabase dashboard."
      );

    default:
      break;
  }

  // No stable code (older edge cases, or a plain fetch/network failure
  // surfaced as a bare Error) — fall back to matching the message.
  if (message.includes("network") || message.includes("fetch")) {
    return at("network", "Couldn't reach the sign-in service. Check your connection and try again.");
  }
  if (message.includes("invalid login credentials") || message.includes("invalid email or password")) {
    return at("invalid-credentials", "That email address and password don't match an account.");
  }
  if (message.includes("email not confirmed") || message.includes("email link is invalid or has expired")) {
    return at("email-not-confirmed", "Confirm your email address first — check your inbox for the link we sent.");
  }
  if (message.includes("popup") && message.includes("clos")) {
    return at("cancelled", "Sign-in was cancelled.", true);
  }
  // Row Level Security denying the follow-up staff-role read — a real
  // access-control outcome, not a sign-in failure, and reported as
  // such rather than mistaken for "wrong password".
  if (message.includes("permission denied") || message.includes("row-level security") || message.includes("rls")) {
    return at(
      "permission-denied",
      "Signed in, but this account wasn't allowed to read its own access record. Check that RLS policies are deployed."
    );
  }
  if (message.includes("unavailable") || message.includes("timeout") || message.includes("timed out")) {
    return at("unavailable", "Couldn't reach the database. Check your connection and try again.");
  }

  return at("unknown", "Something went wrong while signing in. Please try again.");
}

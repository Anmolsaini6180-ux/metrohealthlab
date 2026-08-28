// Turns a raw Firebase error into something a person can act on, while
// keeping the exact technical cause visible in the console.
//
// Sign-in has a lot of genuinely different failure modes — the user
// closed the popup, the browser blocked it, the hostname is not on the
// Firebase authorized-domains list, Firestore denied the role lookup,
// the network dropped — and they all used to surface as one opaque
// string. That is what made a failed admin sign-in impossible to
// diagnose from the screen.
//
// This module changes only what is REPORTED. It never decides what is
// allowed: authorization is still resolved from Firestore and enforced
// by firestore.rules.

export type SignInFailure =
  | "popup-cancelled"
  | "popup-blocked"
  | "unauthorized-domain"
  | "provider-config"
  | "invalid-credentials"
  | "network"
  | "permission-denied"
  | "unavailable"
  | "unknown";

export interface SignInErrorInfo {
  failure: SignInFailure;
  // Firebase's own code, e.g. "auth/popup-blocked" or
  // "permission-denied". An identifier, never a credential.
  code: string;
  // Safe to render in the UI.
  message: string;
  // The user aborted deliberately — show no error at all.
  silent: boolean;
}

// Firebase errors carry a `code`; plain Errors do not.
export function firebaseErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

export function describeSignInError(error: unknown): SignInErrorInfo {
  const code = firebaseErrorCode(error);
  const at = (failure: SignInFailure, message: string, silent = false): SignInErrorInfo => ({
    failure,
    code: code || "unknown",
    message,
    silent,
  });

  switch (code) {
    // ---- The user themselves stopped it. Not an error worth shouting about.
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return at("popup-cancelled", "Sign-in was cancelled.", true);

    // ---- The browser, not Google, refused to open the window.
    case "auth/popup-blocked":
      return at(
        "popup-blocked",
        "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again."
      );

    // ---- The single most common production-only Google sign-in failure.
    case "auth/unauthorized-domain":
      return at(
        "unauthorized-domain",
        "Google sign-in is not enabled for this website address. Add this hostname to Firebase Authentication → Settings → Authorized domains."
      );

    // ---- Project/provider misconfiguration.
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return at(
        "provider-config",
        "Google sign-in is not configured for this Firebase project. Enable the Google provider in Firebase Authentication."
      );

    // ---- Ordinary bad email/password (the other form on the page).
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return at("invalid-credentials", "That email address and password don't match an account.");
    case "auth/user-disabled":
      return at("invalid-credentials", "This account has been disabled.");
    case "auth/too-many-requests":
      return at("invalid-credentials", "Too many attempts. Wait a moment and try again.");

    // ---- Transport.
    case "auth/network-request-failed":
      return at("network", "Couldn't reach the sign-in service. Check your connection and try again.");
    case "unavailable":
    case "deadline-exceeded":
      return at("unavailable", "Couldn't reach the database. Check your connection and try again.");

    // ---- Firestore said no. This is a rules/data problem, NOT a
    // reason to let anyone in; it is reported accurately instead of
    // being mistaken for "you are not an admin".
    case "permission-denied":
      return at(
        "permission-denied",
        "Signed in, but this account wasn't allowed to read its own access record. Check that the Firestore rules are deployed."
      );
    case "unauthenticated":
      return at("permission-denied", "The sign-in session expired before access could be checked. Try again.");

    default:
      return at("unknown", "Something went wrong while signing in. Please try again.");
  }
}

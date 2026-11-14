// Normalizes Firestore/Functions AND Supabase/PostgREST errors into a
// message safe to show in the UI's ErrorState component. We deliberately
// do not fall back to mock data anywhere data fetching fails — callers
// should render an ErrorState with a Retry action instead.
//
// Why this file is not a one-liner any more: a FirebaseError's
// `.message` is often just its raw code. A callable Cloud Function that
// cannot be reached surfaces as the literal string "internal", which is
// exactly what the admin Dashboard was showing the operator — a word
// that names no cause and suggests no action. Codes are mapped to
// something a human can act on, and the technical detail goes to the
// console via logOperationError().
//
// Supabase's PostgrestError ALSO extends Error and ALSO carries a
// `.code` (a Postgres SQLSTATE like "23502"/"42501", or a PostgREST code
// like "PGRST201"). Without explicit handling it falls through to the
// "keep a real message" branch below and leaks Postgres's own engine
// wording straight to the customer screen — e.g. an RLS denial reads as
// `new row violates row-level security policy for table "bookings"`, a
// missing-embed-hint as `Could not embed because more than one
// relationship was found for 'staff_roles' and 'profiles'`. Both name
// real table/column/policy names that mean nothing to a customer and
// should never reach one. This file maps those codes the same way it
// maps Firebase's, while still showing this app's OWN `raise exception
// '<sentence>'` messages from its SECURITY DEFINER RPCs as-is (e.g. "You
// cannot change your own role or access.") — those were hand-authored
// specifically to be shown, and are told apart from raw engine text by
// vocabulary (see RAW_ENGINE_MESSAGE below), not by code, since this
// app's RPCs and Postgres itself both use ordinary SQLSTATEs like 42501.

interface FirebaseLikeError {
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

function asFirebaseError(error: unknown): FirebaseLikeError | null {
  if (typeof error !== "object" || error === null) return null;
  return error as FirebaseLikeError;
}

/** The `code` off a FirebaseError ("permission-denied", "functions/internal", ...). */
export function firebaseErrorCode(error: unknown): string | null {
  const candidate = asFirebaseError(error);
  const code = candidate?.code;
  return typeof code === "string" && code ? code : null;
}

// Codes arrive either bare ("permission-denied") from Firestore or
// namespaced ("functions/internal", "auth/popup-closed-by-user").
function bareCode(code: string): string {
  const slash = code.indexOf("/");
  return slash === -1 ? code : code.slice(slash + 1);
}

const MESSAGE_BY_CODE: Record<string, string> = {
  "permission-denied": "You do not have permission to do that. If your access changed recently, sign out and back in.",
  unauthenticated: "Your session has expired. Please sign in again.",
  "not-found": "That record no longer exists. It may have been deleted by someone else.",
  "already-exists": "That record already exists.",
  "failed-precondition": "That action is not allowed in the current state.",
  "invalid-argument": "Some of the submitted values are not valid. Check the form and try again.",
  "deadline-exceeded": "The request timed out. Check your connection and retry.",
  unavailable: "Cannot reach the server right now. Check your connection and retry.",
  "resource-exhausted": "The project has hit a usage limit. Try again shortly.",
  cancelled: "The request was cancelled.",
  aborted: "That change collided with another edit. Retry.",
  "out-of-range": "A submitted value is out of the allowed range.",
  unimplemented: "That operation is not available in this deployment.",
  "data-loss": "The request failed and data may be incomplete. Retry.",
};

// A callable that is not deployed (or is unreachable/CORS-blocked)
// comes back as `functions/internal` with the message "internal". The
// Cloud Functions tree in this repository is NOT deployed — the project
// is on the Firebase Spark plan — so this is the expected outcome for
// every callable, and saying so is far more useful than "internal".
export const CALLABLE_UNAVAILABLE_MESSAGE =
  "This feature needs a Cloud Function that is not deployed on this project (Firebase Spark plan has no Cloud Functions).";

export function isCallableUnavailable(error: unknown): boolean {
  const code = firebaseErrorCode(error);
  if (!code) return false;
  if (!code.startsWith("functions/")) return false;
  const bare = bareCode(code);
  return bare === "internal" || bare === "not-found" || bare === "unavailable";
}

// Postgres SQLSTATEs are always exactly 5 characters (digits/uppercase,
// e.g. "23502", "42501", "P0002"); PostgREST's own codes are "PGRST"
// plus digits (e.g. "PGRST201"). Firebase codes are always lowercase
// kebab-case ("permission-denied") or slash-namespaced
// ("functions/internal"), so this never collides with MESSAGE_BY_CODE.
function isPostgresShapedCode(code: string): boolean {
  return /^PGRST\d+$/.test(code) || /^[0-9A-Z]{5}$/.test(code);
}

const POSTGRES_MESSAGE_BY_CODE: Record<string, string> = {
  "23502": "Some required information is missing. Please check the form and try again.",
  "23505": "That already exists.",
  "23503": "That action could not be completed because related information is missing or was already removed.",
  "23514": "Some of the submitted values are not valid. Please check the form and try again.",
  "42501": "You do not have permission to do that.",
  "42P01": "Something went wrong loading this. Please try again.",
  "22P02": "One of the submitted values is not in the right format.",
  P0002: "That record could not be found.",
  PGRST116: "That record could not be found.",
  PGRST301: "Your session has expired. Please sign in again.",
};

const POSTGRES_GENERIC_MESSAGE = "Something went wrong. Please try again.";

// Postgres's own engine-generated wording — constraint violations, RLS
// denials, PostgREST's relationship-embedding errors — reliably uses
// this vocabulary and quotes real identifiers. A hand-written `raise
// exception '...'` sentence from one of this app's own RPCs never does.
const RAW_ENGINE_MESSAGE =
  /relation "|column "|constraint "|violates |duplicate key|permission denied for|more than one relationship|schema cache|does not exist|invalid input syntax|operator does not exist|syntax error at or near/i;

export function toUserMessage(error: unknown): string {
  if (isCallableUnavailable(error)) return CALLABLE_UNAVAILABLE_MESSAGE;

  const code = firebaseErrorCode(error);

  if (code && isPostgresShapedCode(code)) {
    const candidate = asFirebaseError(error);
    const rawMessage = typeof candidate?.message === "string" ? candidate.message.trim() : "";
    // A plain sentence with none of Postgres's own vocabulary is this
    // app's own RPC talking (e.g. "You cannot change your own role or
    // access.") — authored to be shown, so show it. Anything else is
    // the database's own wording and must be replaced.
    if (rawMessage && !RAW_ENGINE_MESSAGE.test(rawMessage)) return rawMessage;
    return POSTGRES_MESSAGE_BY_CODE[code] ?? POSTGRES_GENERIC_MESSAGE;
  }

  if (code) {
    const mapped = MESSAGE_BY_CODE[bareCode(code)];
    if (mapped) return mapped;
  }

  if (error instanceof Error) {
    // A bare code as the whole message ("internal") tells the operator
    // nothing; prefer a generic sentence over echoing it.
    const message = error.message.trim();
    if (message && message !== code && !/^[a-z-]+$/.test(message)) return message;
  }

  return code
    ? `The request failed (${code}). Please retry, and check the browser console for details.`
    : "Something went wrong. Please retry, and check the browser console for details.";
}

/**
 * Logs the technical detail the UI deliberately does not show.
 *
 * `context` is for safe diagnostics only — an operation name, a
 * collection path, a callable name, a document id. Never pass
 * credentials, tokens, payment secrets or personal data.
 */
export function logOperationError(operation: string, error: unknown, context?: Record<string, unknown>): void {
  const code = firebaseErrorCode(error);
  console.error(`[metro-health] ${operation} failed`, {
    ...(code ? { code } : {}),
    ...(context ?? {}),
    error,
  });
}

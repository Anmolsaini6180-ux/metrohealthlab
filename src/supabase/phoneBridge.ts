import { getSupabaseClient } from "./client";

// The phone-auth bridge — Firebase Auth remains the ONLY phone-OTP
// provider (Supabase has no free SMS option), so a phone sign-in
// starts with a Firebase ID token, not a Supabase session. Everything
// in this app that owns customer data (patients, addresses, bookings,
// notifications, reports) is keyed by the Supabase-authenticated
// identity (profiles.id / auth.uid()), which RLS requires — there is
// no client-only way to satisfy that from an unauthenticated-in-
// Supabase browser holding only a Firebase token.
//
// bridgePhoneSession() closes that gap via the bridge-phone-session
// Edge Function: it verifies the Firebase ID token's signature
// server-side (never trusting a client-supplied uid/phone), resolves
// or creates the matching Supabase identity by firebase_uid first,
// phone second (see resolvePhoneBridgeTarget below — the same
// precedence, mirrored from scripts/migration/lib/authPlan.mjs), and
// mints a real Supabase session entirely server-side. This function
// only ever sees the resulting access/refresh tokens — never a
// service-role key, never the raw Firebase claims.

export type PhoneBridgeResult =
  | { action: "attach-existing"; profileId: string; matchedBy: "firebase_uid" | "phone" }
  | { action: "create-new"; profileId: null; matchedBy: null };

/**
 * Pure decision mirror of the bridge-phone-session Edge Function's own
 * resolution step (public.bridge_phone_identity) — kept here, tested,
 * as living documentation of the precedence the real server-side path
 * implements. Not called directly by the live bridge (the database is
 * the actual source of truth, since only it can see current profiles
 * under concurrent writes), but any future browser-side reasoning
 * about "what will the bridge do" should match this exactly.
 * firebase_uid is checked before phone, since a phone number can be
 * reassigned by a carrier but firebase_uid cannot.
 */
export function resolvePhoneBridgeTarget({
  firebaseUid,
  phone,
  profilesByFirebaseUid,
  profilesByPhone,
}: {
  firebaseUid: string | null;
  phone: string | null;
  profilesByFirebaseUid: Map<string, string>;
  profilesByPhone: Map<string, string>;
}): PhoneBridgeResult {
  if (firebaseUid && profilesByFirebaseUid.has(firebaseUid)) {
    return { action: "attach-existing", profileId: profilesByFirebaseUid.get(firebaseUid)!, matchedBy: "firebase_uid" };
  }
  if (phone && profilesByPhone.has(phone)) {
    return { action: "attach-existing", profileId: profilesByPhone.get(phone)!, matchedBy: "phone" };
  }
  return { action: "create-new", profileId: null, matchedBy: null };
}

export interface PhoneBridgeSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * Exchanges a verified Firebase phone-sign-in ID token for a real
 * Supabase session belonging to the same customer identity every other
 * login method already uses. Throws a clear, safe, user-showable
 * message on any failure (invalid/expired token, ambiguous identity,
 * transient error) — never silently returns a broken/partial result.
 */
export async function bridgePhoneSession(firebaseIdToken: string): Promise<PhoneBridgeSession> {
  const { data, error } = await getSupabaseClient().functions.invoke<{ accessToken?: string; refreshToken?: string; error?: string }>(
    "bridge-phone-session",
    { body: { firebaseIdToken } }
  );

  if (error) {
    // supabase-js wraps a non-2xx Edge Function response in a generic
    // FunctionsHttpError whose own .message is unhelpful ("Edge
    // Function returned a non-2xx status code") — the function's own
    // JSON error body (carried on the error's `context` response) has
    // the real, safe-to-show reason.
    const context = (error as { context?: Response }).context;
    let specificMessage: string | null = null;
    if (context && typeof context.clone === "function") {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === "string" && body.error) specificMessage = body.error;
      } catch {
        // response body wasn't JSON (or already consumed) — fall through
      }
    }
    throw new Error(specificMessage ?? "Could not verify your phone sign-in. Please try again.");
  }

  if (!data?.accessToken || !data?.refreshToken) {
    throw new Error(data?.error || "Could not verify your phone sign-in. Please try again.");
  }

  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

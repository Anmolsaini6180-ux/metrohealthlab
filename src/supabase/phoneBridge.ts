// The phone-auth bridge design from the Phase D audit, as application
// code. Firebase Auth remains the ONLY phone-OTP provider (Supabase has
// no free SMS option) — this module exists to attach a Firebase phone
// sign-in to the correct existing Supabase profile, by firebase_uid
// first and phone second, so a returning customer is never forked into
// a second unrelated account and never loses their booking history.
//
// The decision logic (resolvePhoneBridgeTarget) is copied verbatim in
// shape from scripts/migration/lib/authPlan.mjs's function of the same
// name — same precedence, same reasoning — because the rule does not
// change between migration time and runtime. It is duplicated rather
// than imported because the migration scripts run in Node against
// service-role credentials and are not part of the browser bundle;
// nothing under scripts/ should ever be importable from src/.
//
// HONEST LIMITATION, not glossed over: actually attaching or creating a
// profile for an unauthenticated-in-Supabase browser (a phone sign-in
// has a Firebase ID token, not a Supabase session, so `profiles` RLS —
// which requires `id = auth.uid()` — cannot be satisfied client-side)
// requires a privileged server-side step: verify the Firebase ID
// token, then look up/create the profile with the service-role key.
// That server-side piece is Phase I (Edge Functions) work and does not
// exist yet. bridgePhoneSession() below documents exactly that gap
// instead of faking a client-only implementation that cannot actually
// satisfy RLS.

export type PhoneBridgeResult =
  | { action: "attach-existing"; profileId: string; matchedBy: "firebase_uid" | "phone" }
  | { action: "create-new"; profileId: null; matchedBy: null };

/**
 * Pure decision: given a Firebase phone sign-in and the two lookup
 * maps a privileged server call would have already fetched, decide
 * whether to attach to an existing profile or create a new one.
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

/**
 * NOT YET FUNCTIONAL. Documents the intended entry point so
 * useAuth.tsx has something concrete to call once the server-side
 * piece exists, instead of inventing a client-only shortcut that would
 * silently fail RLS or, worse, appear to work by accident.
 */
export async function bridgePhoneSession(_firebaseIdToken: string): Promise<never> {
  throw new Error(
    "Phone-auth bridging into Supabase requires a server-side Edge Function " +
      "(verify the Firebase ID token, then resolve/create the profile with the " +
      "service-role key — profiles RLS cannot be satisfied from an unauthenticated " +
      "browser session). Not implemented yet: this is Phase I work, not Phase E."
  );
}

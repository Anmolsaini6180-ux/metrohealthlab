import { getSupabaseClient } from "./client";
import { getCurrentSession } from "./auth";

/**
 * Resolves the Supabase `profiles.id` (== `auth.users.id`, a real
 * UUID) linked to the given Firebase uid, or null when there is no
 * live, verified Supabase session right now.
 *
 * WHY THIS EXISTS: every customer-data table this app reads through
 * Supabase (patients, addresses, bookings, reports, notifications,
 * support_tickets, profiles) has its ownership column typed `uuid`,
 * FK'd to `profiles.id`. The app's live identity everywhere else stays
 * Firebase-shaped (`user.uid` from `useAuth()`) — Firebase uids are
 * NOT valid UUID strings, so passing one into a `.eq("user_id", ...)`
 * filter on a uuid column fails at the database with
 * `22P02 invalid input syntax for type uuid`. This is the bridge: call
 * it once (useAuth.tsx does, exposing the result as
 * `supabaseUserId`), then pass THAT into every Supabase-backed
 * customer-data call instead of `user.uid`.
 *
 * Mirrors resolveStaffContextForFirebaseUser's own verification
 * exactly (live session must exist, and its profile's firebase_uid
 * must match the caller) so a stale Supabase session left on a shared
 * device can never be misread as belonging to whoever is currently
 * signed into Firebase. Fails closed (returns null) on any error —
 * the caller is expected to show an honest "can't load your data right
 * now" state, never fall back to a customer's private data appearing
 * empty and silent.
 *
 * A null result while `user` is signed in has two real causes: (1)
 * Supabase is briefly unreachable, or (2) this is a phone-authenticated
 * account, which never gets a Supabase session at all — Supabase has
 * no free SMS provider (see phoneBridge.ts), so this is not a bug to
 * "fix" by faking a session, it's a genuine unsupported-for-now path
 * that must be reported honestly rather than hidden.
 */
export async function getSupabaseUserId(firebaseUid: string): Promise<string | null> {
  let session;
  try {
    session = await getCurrentSession();
  } catch (err) {
    console.error("Could not read the Supabase session while resolving customer identity:", err);
    return null;
  }
  if (!session) return null;

  try {
    const { data: profile, error } = await getSupabaseClient()
      .from("profiles")
      .select("firebase_uid")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile || profile.firebase_uid !== firebaseUid) return null;
    return session.user.id;
  } catch (err) {
    console.error("Could not verify the linked Supabase profile:", err);
    return null;
  }
}

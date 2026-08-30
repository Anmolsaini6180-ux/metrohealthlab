import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { getCurrentSession } from "./auth";
import { buildStaffContext } from "@/utils/roleAccess";
import type { StaffContext } from "@/types/team";
import type { StaffRecordData } from "@/services/roleService";

// The Supabase-side equivalent of src/services/roleService.ts's
// resolveStaffContext(). Deliberately reuses buildStaffContext() from
// roleAccess.ts UNCHANGED — the precedence rules (master first, then
// an active assigned role, a stored SUPER_ADMIN never honoured) do not
// change just because the storage moved from Firestore documents to
// Postgres rows. Only how the two trusted inputs are FETCHED differs:
//
//   Firestore                          Postgres
//   system/config.masterAdminUid   ->  app_config.master_admin_uid
//   users/{uid}.role/.status/...   ->  staff_roles row for profiles.id
//
// This is presentation/query-shaping only, exactly as the Firestore
// version's own comment states: RLS re-derives the same two inputs on
// every request regardless of what this function returns.
//
// NOT wired into useAuth.tsx yet — see auth.ts's header comment.

async function getMasterAdminUid(): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from("app_config")
    .select("value")
    .eq("key", "master_admin_uid")
    .maybeSingle();
  // A missing row is the normal "not bootstrapped yet" state, exactly
  // like a missing system/config document — not an error.
  if (error) throw error;
  const raw = data?.value;
  return typeof raw === "string" ? raw : "";
}

async function getStaffRecord(userId: string): Promise<StaffRecordData | null> {
  const { data, error } = await getSupabaseClient()
    .from("staff_roles")
    .select("role, status, super_admin_id, admin_id, sub_admin_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Field names bridge snake_case (Postgres) -> camelCase (the shared
  // StaffRecordData shape roleAccess.ts already knows how to read).
  return {
    role: data.role,
    status: data.status,
    superAdminId: data.super_admin_id ?? undefined,
    adminId: data.admin_id ?? undefined,
    subAdminId: data.sub_admin_id ?? undefined,
  };
}

export async function resolveStaffContext(user: User): Promise<StaffContext> {
  const [masterUid, record] = await Promise.all([getMasterAdminUid(), getStaffRecord(user.id)]);
  return buildStaffContext(user.id, masterUid, record);
}

/**
 * The bridge useAuth.tsx actually calls. The app's identity stays
 * Firebase-shaped (Firestore data is unmigrated, and every existing
 * `where("userId","==",uid)` query needs the Firebase uid, not a
 * Supabase uuid) — but AUTHORIZATION now comes from Supabase's
 * app_config/staff_roles, per the Phase E cutover.
 *
 * Fails closed in every uncertain case, exactly like the Firestore
 * version this replaces:
 *   - no live Supabase session (e.g. a phone sign-in, which has none;
 *     or Supabase was briefly unreachable) -> no role, customer only
 *   - a live session exists but its OWN profile's firebase_uid does
 *     not match the Firebase identity asking -> no role. This is the
 *     one check that must never be skipped: without it, a stale
 *     Supabase session left over from a different account on a shared
 *     device could otherwise be misread as belonging to whoever is
 *     currently signed into Firebase.
 *
 * The returned context's `.uid` is normalized to the FIREBASE uid so
 * every existing consumer (roleAccess.ts comparisons, the staff
 * directory, ownership-chain checks against Firestore-stored ids)
 * keeps working unchanged. Note: for any FUTURE delegated staff member
 * created through Supabase directly, the ownership-chain fields
 * (superAdminId/adminId/subAdminId) below are Supabase uuids, not
 * Firebase uids — today there are zero delegated staff rows, so this
 * has no live data to be wrong about yet, but it must be reconciled
 * before staff-hierarchy management itself moves off Firestore.
 */
export async function resolveStaffContextForFirebaseUser(firebaseUid: string): Promise<StaffContext> {
  let session;
  try {
    session = await getCurrentSession();
  } catch (err) {
    console.error("Could not read the Supabase session while resolving staff authorization:", err);
    return buildStaffContext(firebaseUid, "", null);
  }
  if (!session) return buildStaffContext(firebaseUid, "", null);

  try {
    const { data: profile, error } = await getSupabaseClient()
      .from("profiles")
      .select("firebase_uid")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile || profile.firebase_uid !== firebaseUid) {
      // Either this Supabase session belongs to someone else (stale
      // session on a shared device) or the profile row does not exist
      // yet. Either way: no authority is granted from it.
      return buildStaffContext(firebaseUid, "", null);
    }
    const context = await resolveStaffContext(session.user);
    return { ...context, uid: firebaseUid };
  } catch (err) {
    console.error("Could not resolve Supabase staff authorization:", err);
    return buildStaffContext(firebaseUid, "", null);
  }
}

/**
 * Live subscription to the caller's own authorization, mirroring
 * subscribeToStaffRecord() in the Firestore version: a role change or
 * revocation should apply within seconds, not linger until the next
 * page load. Backed by Supabase Realtime instead of onSnapshot.
 *
 * Requires the `staff_roles` table to be added to the
 * supabase_realtime publication — it is NOT currently published (see
 * the Phase D readiness report), so this subscription is inert (never
 * fires) until that is enabled. Documented rather than silently
 * broken: the initial resolveStaffContext() call above still works
 * correctly either way; only the LIVE update is affected.
 */
export function subscribeToStaffRecord(
  userId: string,
  masterUid: string,
  callback: (context: StaffContext) => void
): () => void {
  const channel = getSupabaseClient()
    .channel(`staff-role-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "staff_roles", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? null) as Record<string, unknown> | null;
        const record: StaffRecordData | null = row
          ? {
              role: row.role,
              status: row.status,
              superAdminId: (row.super_admin_id as string | undefined) ?? undefined,
              adminId: (row.admin_id as string | undefined) ?? undefined,
              subAdminId: (row.sub_admin_id as string | undefined) ?? undefined,
            }
          : null;
        callback(buildStaffContext(userId, masterUid, record));
      }
    )
    .subscribe();

  return () => {
    getSupabaseClient().removeChannel(channel);
  };
}

/**
 * The subscription useAuth.tsx actually calls, keyed by the FIREBASE
 * uid (matching resolveStaffContextForFirebaseUser's shape) rather
 * than requiring the caller to separately track the Supabase session's
 * own id.
 *
 * HONEST LIMITATION: `staff_roles` is not yet in the
 * supabase_realtime publication (see the Phase D readiness report) —
 * enabling that is explicitly out of scope for this cutover ("do not
 * start Realtime migration yet"). Until it is enabled, the
 * subscription below is registered but will never actually fire; a
 * role change/revocation will not apply live the way the old Firestore
 * onSnapshot did. It is still wired up now so it starts working the
 * moment Realtime is turned on for that table, with no further code
 * change needed here.
 */
export function subscribeToStaffRecordForFirebaseUser(
  firebaseUid: string,
  callback: (context: StaffContext) => void
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  getCurrentSession()
    .then(async (session) => {
      if (cancelled || !session) return;
      const { data: profile } = await getSupabaseClient()
        .from("profiles")
        .select("firebase_uid")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled || !profile || profile.firebase_uid !== firebaseUid) return;

      const masterUid = await getMasterAdminUid();
      unsubscribe = subscribeToStaffRecord(session.user.id, masterUid, (context) => {
        callback({ ...context, uid: firebaseUid });
      });
    })
    .catch((err) => console.error("Could not start the Supabase staff-role subscription:", err));

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

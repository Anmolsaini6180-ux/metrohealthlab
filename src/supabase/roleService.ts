import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, subscribeToTableChanges } from "./client";
import { buildStaffContext } from "@/utils/roleAccess";
import type { StaffContext } from "@/types/team";

// Was imported from the now-deleted Firestore services/roleService.ts
// (that file's own runtime functions had zero live callers left — this
// was its only surviving use, a compile-time-only type import).
export interface StaffRecordData {
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: unknown;
  status?: unknown;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Reuses buildStaffContext() from roleAccess.ts unchanged — the
// precedence rules (master first, then an active assigned role, a
// stored SUPER_ADMIN never honoured) are the same regardless of
// storage. The two trusted inputs:
//
//   app_config.master_admin_uid  ->  who the bootstrapped super admin is
//   staff_roles row for user.id  ->  everyone else's role/status/chain
//
// This is presentation/query-shaping only: RLS re-derives the same two
// inputs on every request regardless of what this function returns.
//
// Called directly against the live Supabase session in useAuth.tsx —
// no Firebase-uid bridge involved. Supabase Auth IS the account's
// identity for anyone who signed in with email/Google, so `user.id`
// here already is the account's one real id.

export async function getMasterAdminUid(): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from("app_config")
    .select("value")
    .eq("key", "master_admin_uid")
    .maybeSingle();
  // A missing row is the normal "not bootstrapped yet" state, not an error.
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
 * Live subscription to the caller's own authorization: a role change or
 * revocation should apply within seconds, not linger until the next
 * page load.
 *
 * HONEST LIMITATION: `staff_roles` is not yet in the supabase_realtime
 * publication, so this subscription is registered but inert (never
 * fires) until that table is added to it. Documented rather than
 * silently broken: the initial resolveStaffContext() call in
 * useAuth.tsx still runs correctly on every sign-in and full page load
 * either way; only the LIVE update is affected.
 */
export function subscribeToStaffRecord(
  userId: string,
  masterUid: string,
  callback: (context: StaffContext) => void
): () => void {
  return subscribeToTableChanges<{ new: Record<string, unknown> | null }>(
    `staff-role-${userId}`,
    { event: "*", schema: "public", table: "staff_roles", filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new ?? null;
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
  );
}

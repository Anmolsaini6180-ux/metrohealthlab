// Supabase-backed. Reads go straight through staff_roles/profiles,
// scoped by RLS's staff_roles_select policy (SUPER_ADMIN sees
// everyone, ADMIN/SUB_ADMIN only their own subtree via admin_id/
// sub_admin_id, exactly like the Firestore version's fetchScopedStaff
// query did) -- a tampered client-side caller object yields fewer rows,
// never more. Every mutation goes through the set_staff_role /
// grant_staff_role_by_email RPCs (Phase H), which replicate
// canAssignRole()/ownershipChainFor()/hasAuthorityOver() from
// roleAccess.ts server-side, because "assign only strictly beneath your
// own role, only within your own subtree" is not expressible as a
// row-level policy.
//
// IMPORTANT: every uid here (StaffDirectoryEntry.uid, TeamMember.uid,
// the id passed to grantStaffRoleByEmail's lookup) is now the SUPABASE
// auth uuid, not the app's Firebase uid — staff_roles is keyed by
// profiles.id. StaffContext.uid stays Firebase-shaped for the rest of
// the app (see src/supabase/roleService.ts), so it is never compared
// directly against a uid from this file; the server-side RPC checks
// (never-yourself, never-the-master) are the real boundary regardless
// of what a stale client-side comparison would show.
import { getSupabaseClient } from "@/supabase/client";
import type { AdminRole, StaffContext, StaffDirectoryEntry, TeamMember, TeamMemberStatus } from "@/types/team";

export class StaffOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffOperationError";
  }
}

interface StaffRoleRow {
  user_id: string;
  role: AdminRole;
  status: TeamMemberStatus;
  super_admin_id: string | null;
  admin_id: string | null;
  sub_admin_id: string | null;
  updated_at: unknown;
  profiles: { name: string | null; email: string | null; phone: string | null } | null;
}

function toTeamMember(row: StaffRoleRow): TeamMember {
  return {
    uid: row.user_id,
    name: row.profiles?.name ?? "",
    email: row.profiles?.email ?? "",
    phone: row.profiles?.phone ?? undefined,
    role: row.role,
    status: row.status,
    superAdminId: row.super_admin_id ?? undefined,
    adminId: row.admin_id ?? undefined,
    subAdminId: row.sub_admin_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

async function fetchScopedStaff(): Promise<TeamMember[]> {
  // No manual scoping filter here on purpose — RLS's staff_roles_select
  // policy already returns exactly the caller's authorized subtree (or
  // everyone, for SUPER_ADMIN). Building a client-side where() clause
  // on top would only be convenience, never the boundary, and could
  // silently diverge from what RLS actually allows.
  const { data, error } = await getSupabaseClient()
    .from("staff_roles")
    .select("user_id, role, status, super_admin_id, admin_id, sub_admin_id, updated_at, profiles(name, email, phone)")
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as StaffRoleRow[]).map(toTeamMember);
}

export async function getStaffDirectory(caller: StaffContext): Promise<StaffDirectoryEntry[]> {
  const members = await fetchScopedStaff();
  return members
    .map((m) => ({
      uid: m.uid,
      email: m.email,
      name: m.name || undefined,
      phone: m.phone,
      role: m.role,
      status: m.status,
      isMasterAdmin: !!caller.masterUid && m.uid === caller.masterUid,
      superAdminId: m.superAdminId,
      adminId: m.adminId,
      subAdminId: m.subAdminId,
    }))
    .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
}

export async function getTeamMembers(caller: StaffContext, role?: AdminRole): Promise<TeamMember[]> {
  const members = await fetchScopedStaff();
  const staff = members.filter((m) => m.uid !== caller.uid);
  return role ? staff.filter((m) => m.role === role) : staff;
}

export async function setStaffRole(
  _caller: StaffContext,
  targetUid: string,
  role: AdminRole,
  options: { status?: Exclude<TeamMemberStatus, "inactive">; preserveChain?: boolean } = {}
): Promise<void> {
  const { status = "active", preserveChain = false } = options;
  const { error } = await getSupabaseClient().rpc("set_staff_role", {
    p_target_user_id: targetUid,
    p_role: role,
    p_status: status,
    p_preserve_chain: preserveChain,
  });
  if (error) throw new StaffOperationError(error.message);
}

export async function grantStaffRoleByEmail(
  _caller: StaffContext,
  email: string,
  role: AdminRole
): Promise<{ uid: string }> {
  const { data, error } = await getSupabaseClient().rpc("grant_staff_role_by_email", {
    p_email: email,
    p_role: role,
  });
  if (error) throw new StaffOperationError(error.message);
  return { uid: (data as unknown as { user_id: string }).user_id };
}

export async function changeStaffRole(caller: StaffContext, target: StaffDirectoryEntry, role: AdminRole): Promise<void> {
  await setStaffRole(caller, target.uid, role, { preserveChain: true });
}

export async function revokeStaffMember(caller: StaffContext, target: StaffDirectoryEntry): Promise<void> {
  await setStaffRole(caller, target.uid, target.role, { status: "revoked", preserveChain: true });
}

export async function restoreStaffMember(caller: StaffContext, target: StaffDirectoryEntry): Promise<void> {
  await setStaffRole(caller, target.uid, target.role, { status: "active", preserveChain: true });
}

export async function updateTeamMemberStatus(
  caller: StaffContext,
  member: TeamMember,
  status: Exclude<TeamMemberStatus, "inactive">
): Promise<void> {
  await setStaffRole(caller, member.uid, member.role, { status, preserveChain: true });
}

import { callFunction } from "@/firebase/functions";
import type { AdminRole, StaffDirectoryEntry, TeamMember, TeamMemberStatus } from "@/types/team";

export interface CreateTeamMemberRequest {
  name: string;
  email: string;
  phone?: string;
  role: AdminRole;
  temporaryPassword: string;
}

// Every write here is a Cloud Function call, never a direct Firestore
// write — assigning a role means setting Firebase Auth custom claims
// (role + hierarchy chain), which only the Admin SDK can do, and
// writing staffInvites, which firestore.rules closes to all clients.
export async function createTeamMember(payload: CreateTeamMemberRequest): Promise<{ uid: string }> {
  return callFunction<CreateTeamMemberRequest, { uid: string }>("createTeamMember", payload);
}

export async function updateTeamMemberStatus(uid: string, status: TeamMemberStatus): Promise<{ ok: true }> {
  return callFunction<{ uid: string; status: TeamMemberStatus }, { ok: true }>("updateTeamMemberStatus", {
    uid,
    status,
  });
}

export async function getTeamMembers(role?: AdminRole): Promise<TeamMember[]> {
  const result = await callFunction<{ role?: AdminRole }, { members: TeamMember[] }>("getTeamMembers", { role });
  return result.members;
}

// ---------- Email-keyed staff management (Admin & Staff screen) ----------

export interface UpsertStaffMemberRequest {
  email: string;
  name?: string;
  phone?: string;
  role: AdminRole;
}

export interface UpsertStaffMemberResult {
  email: string;
  role: AdminRole;
  // The person already had a Firebase Auth account, so the role took
  // effect immediately rather than waiting for their first sign-in.
  appliedNow: boolean;
  pending: boolean;
}

// Adds a new staff member by email, or changes an existing one's role.
// The server re-checks the caller's own role from their signed token
// and refuses anything at or above it — nothing here is trusted.
export async function upsertStaffMember(payload: UpsertStaffMemberRequest): Promise<UpsertStaffMemberResult> {
  return callFunction<UpsertStaffMemberRequest, UpsertStaffMemberResult>("upsertStaffMember", payload);
}

// Removes admin access: clears the custom claim, revokes refresh
// tokens, and marks the assignment revoked so signing in again cannot
// restore it.
export async function revokeStaffMember(email: string): Promise<{ ok: true; email: string }> {
  return callFunction<{ email: string }, { ok: true; email: string }>("revokeStaffMember", { email });
}

export async function getStaffDirectory(): Promise<StaffDirectoryEntry[]> {
  const result = await callFunction<Record<string, never>, { staff: StaffDirectoryEntry[] }>("getStaffDirectory", {});
  return result.staff;
}

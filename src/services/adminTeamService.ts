import { callFunction } from "@/firebase/functions";
import type { AdminRole, TeamMember, TeamMemberStatus } from "@/types/team";

export interface CreateTeamMemberRequest {
  name: string;
  email: string;
  phone?: string;
  role: AdminRole;
  temporaryPassword: string;
}

// Every write here is a Cloud Function call, never a direct Firestore
// write — creating a staff account means setting Firebase Auth custom
// claims (role + hierarchy chain), which only the Admin SDK can do.
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

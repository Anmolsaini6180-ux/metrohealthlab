import { callFunction } from "@/firebase/functions";

export interface AgentPerformance {
  uid: string;
  name: string;
  assigned: number;
  completed: number;
  pending: number;
  cancelled: number;
  completionRate: number;
}

export async function getTeamPerformance(startDate: string, endDate: string): Promise<{ performance: AgentPerformance[]; truncated: boolean }> {
  return callFunction("getTeamPerformance", { startDate, endDate });
}

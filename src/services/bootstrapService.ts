import { callFunction } from "@/firebase/functions";

export async function bootstrapSuperAdmin(bootstrapSecret: string, name: string): Promise<{ ok: true }> {
  return callFunction<{ bootstrapSecret: string; name: string }, { ok: true }>("bootstrapSuperAdmin", {
    bootstrapSecret,
    name,
  });
}

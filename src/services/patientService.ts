// Supabase-backed. RLS enforces user_id = auth.uid() on every
// operation, exactly like Firestore's isOwner(userId) rule did — this
// service passes userId explicitly (same call signature as before) but
// the real boundary is the database policy, not this file.
import { getSupabaseClient } from "@/supabase/client";
import { rowToPatient } from "@/supabase/mappers";
import type { Patient } from "@/types/patient";

export async function getPatients(userId: string): Promise<Patient[]> {
  const { data, error } = await getSupabaseClient().from("patients").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(rowToPatient);
}

export async function addPatient(
  userId: string,
  data: Omit<Patient, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("patients")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      name: data.name,
      relationship: data.relationship,
      dob: data.dob,
      gender: data.gender,
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function updatePatient(
  patientId: string,
  data: Partial<Omit<Patient, "id" | "userId" | "createdAt">>
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.relationship !== undefined) patch.relationship = data.relationship;
  if (data.dob !== undefined) patch.dob = data.dob;
  if (data.gender !== undefined) patch.gender = data.gender;
  const { error } = await getSupabaseClient().from("patients").update(patch).eq("id", patientId);
  if (error) throw error;
}

export async function deletePatient(patientId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("patients").delete().eq("id", patientId);
  if (error) throw error;
}

// Supabase-backed. RLS: support_tickets_select allows own row or
// staff; support_tickets_insert_own requires user_id = auth.uid().
import { getSupabaseClient } from "@/supabase/client";
import { rowToSupportTicket } from "@/supabase/mappers";
import type { SupportTicket } from "@/types/support";

export async function createSupportTicket(
  userId: string,
  data: { subject: string; message: string; bookingId?: string }
): Promise<string> {
  const { data: row, error } = await getSupabaseClient()
    .from("support_tickets")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      subject: data.subject,
      message: data.message,
      booking_id: data.bookingId ?? null,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function getUserTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await getSupabaseClient()
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSupportTicket);
}

// Supabase-backed. support_tickets_select allows can_manage_catalog()
// to see every ticket (not just their own row); support_tickets_
// staff_update is the same gate for changing status. There is no
// "response" column in this schema yet — customer-facing replies would
// need a real thread table added first, so this deliberately only
// exposes what the schema actually supports (list/filter/status),
// not a fabricated reply box that doesn't persist anywhere.
import { getSupabaseClient, safeSubscribe } from "@/supabase/client";
import { rowToSupportTicket } from "@/supabase/mappers";
import type { SupportTicket } from "@/types/support";

type Unsubscribe = () => void;

export interface AdminSupportTicket extends SupportTicket {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}

const SELECT = "*, profiles(name, email, phone)";

function rowToAdminTicket(r: Record<string, unknown>): AdminSupportTicket {
  const profile = (r.profiles as Record<string, unknown> | null) ?? null;
  return {
    ...rowToSupportTicket(r),
    customerName: (profile?.name as string) ?? null,
    customerEmail: (profile?.email as string) ?? null,
    customerPhone: (profile?.phone as string) ?? null,
  };
}

export async function getAllTickets(status?: SupportTicket["status"]): Promise<AdminSupportTicket[]> {
  let query = getSupabaseClient().from("support_tickets").select(SELECT).order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToAdminTicket);
}

/** Live: a new ticket, or anyone changing a ticket's status, shows up
 * without a refresh — the same realtime contract every other admin
 * list in this app already has. */
export function subscribeToAllTickets(
  callback: (tickets: AdminSupportTicket[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getAllTickets().then(callback).catch((err) => onError?.(err));
  refetch();
  return safeSubscribe(() => {
    const channel = getSupabaseClient()
      .channel("admin-support-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, refetch)
      .subscribe();
    return () => getSupabaseClient().removeChannel(channel);
  }, onError);
}

export async function updateTicketStatus(ticketId: string, status: SupportTicket["status"]): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("support_tickets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw error;
}

// Supabase-backed. RLS: notifications_select allows own row or staff;
// notifications_mark_read allows only the owner to flip `read`.
import { getSupabaseClient } from "@/supabase/client";
import { rowToNotification } from "@/supabase/mappers";
import type { AppNotification } from "@/types/notification";

type Unsubscribe = () => void;

async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToNotification);
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => fetchNotifications(userId).then(callback).catch((err) => onError?.(err));
  refetch();
  const channel = getSupabaseClient()
    .channel(`notifications-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refetch)
    .subscribe();
  return () => getSupabaseClient().removeChannel(channel);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("notifications").update({ read: true }).eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}

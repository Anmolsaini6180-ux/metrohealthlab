// Supabase-backed. RLS: notifications_select allows own row or staff;
// notifications_mark_read allows only the owner to flip `read`.
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
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
  // Shared/ref-counted: the header renders NotificationBell twice at
  // once (desktop nav + mobile nav), and the notification page can be
  // open at the same time as either — all for the same userId, so this
  // topic name is exactly the one that used to crash. See
  // subscribeToTableChanges's own doc comment for the full story.
  return subscribeToTableChanges(
    `notifications-${userId}`,
    { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
    refetch,
    onError
  );
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

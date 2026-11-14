// Supabase-backed. RLS: notifications_select allows own row or staff;
// notifications_mark_read allows only the owner to flip `read`.
import { getSupabaseClient, subscribeToTableChanges } from "@/supabase/client";
import { rowToNotification } from "@/supabase/mappers";
import type { AppNotification } from "@/types/notification";

type Unsubscribe = () => void;

// A long-lived account accumulates one row per booking-lifecycle event
// plus every broadcast it was ever sent — unbounded, this becomes
// thousands of rows fetched on every single realtime refetch, for a
// customer who never needs to see more than a recent slice at once.
// Every list consumer (the bell dropdown, the full notifications page)
// passes an explicit `limit` — see fetchNotifications' own default.
const DEFAULT_LIST_LIMIT = 50;

async function fetchNotifications(userId: string, limit: number = DEFAULT_LIST_LIMIT): Promise<AppNotification[]> {
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToNotification);
}

/**
 * `limit` is how many of the most recent notifications to keep loaded —
 * not a one-time page size. Every realtime refetch re-runs the query
 * with this same limit, so raising it (NotificationsPage's "Load more")
 * and simply passing a bigger number here is what makes more rows
 * appear; there is no separate offset/cursor to track.
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void,
  limit: number = DEFAULT_LIST_LIMIT
): Unsubscribe {
  const refetch = () => fetchNotifications(userId, limit).then(callback).catch((err) => onError?.(err));
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

/**
 * Just the unread count — a `head: true` count query transfers no row
 * data at all, so this stays cheap regardless of how much notification
 * history the account has, unlike deriving the count by fetching and
 * filtering the list client-side (what this used to do).
 */
async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

/** Realtime unread count for the header bell badge — see fetchUnreadNotificationCount. */
export function subscribeToUnreadNotificationCount(
  userId: string,
  callback: (count: number) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => fetchUnreadNotificationCount(userId).then(callback).catch((err) => onError?.(err));
  refetch();
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

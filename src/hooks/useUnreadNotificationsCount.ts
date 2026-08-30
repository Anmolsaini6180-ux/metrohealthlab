import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { subscribeToNotifications } from "@/services/notificationService";

// Realtime unread count for the header bell badge — separate from
// NotificationsPage's own subscription so the badge stays live no
// matter which page the customer is on.
export function useUnreadNotificationsCount(): number {
  // notifications.user_id is a Supabase uuid — never the Firebase
  // user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!supabaseUserId) {
      setCount(0);
      return;
    }
    const unsubscribe = subscribeToNotifications(
      supabaseUserId,
      (notifications) => setCount(notifications.filter((n) => !n.read).length),
      () => setCount(0)
    );
    return unsubscribe;
  }, [supabaseUserId]);

  return count;
}

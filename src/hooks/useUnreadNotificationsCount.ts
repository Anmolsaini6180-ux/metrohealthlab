import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { subscribeToUnreadNotificationCount } from "@/services/notificationService";

// Realtime unread count for the header bell badge — separate from
// NotificationsPage's own subscription so the badge stays live no
// matter which page the customer is on. Uses a dedicated count-only
// query (see subscribeToUnreadNotificationCount) rather than fetching
// the whole notification list and counting client-side — that would
// transfer every notification the account has ever received, on every
// page, just to show a small badge number.
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
    const unsubscribe = subscribeToUnreadNotificationCount(supabaseUserId, setCount, () => setCount(0));
    return unsubscribe;
  }, [supabaseUserId]);

  return count;
}

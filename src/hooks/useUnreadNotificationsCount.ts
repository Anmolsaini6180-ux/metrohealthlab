import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { subscribeToNotifications } from "@/services/notificationService";

// Realtime unread count for the header bell badge — separate from
// NotificationsPage's own subscription so the badge stays live no
// matter which page the customer is on.
export function useUnreadNotificationsCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const unsubscribe = subscribeToNotifications(
      user.uid,
      (notifications) => setCount(notifications.filter((n) => !n.read).length),
      () => setCount(0)
    );
    return unsubscribe;
  }, [user?.uid]);

  return count;
}

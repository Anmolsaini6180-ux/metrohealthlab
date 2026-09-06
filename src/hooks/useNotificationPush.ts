import { useEffect, useRef } from "react";
import { subscribeToTableChanges } from "@/supabase/client";

/**
 * A real OS-level notification (not just the in-app bell badge) the
 * moment a new row lands in `notifications` for this account — the
 * gap being closed here is "I sent/received a notification and had no
 * way to tell, short of clicking the bell." This is foreground-only:
 * it fires while a tab for this site is open (the realtime
 * subscription that drives it, like every other one in this app, only
 * runs while the page does) — a real background push that reaches a
 * closed app/browser needs a server-side send through Firebase Cloud
 * Messaging with a service-account credential, which this app does not
 * have configured. Mount this ONCE per page (a root layout), not per
 * component instance — NotificationBell itself renders twice at once
 * (mobile + desktop nav) and would fire a duplicate toast for every
 * single notification if it owned this instead.
 */
export function useNotificationPush(userId: string | null | undefined): void {
  const permissionAsked = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!permissionAsked.current && Notification.permission === "default") {
      permissionAsked.current = true;
      Notification.requestPermission().catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    // Same topic name subscribeToNotifications/subscribeToUnreadNotificationCount
    // already use for this userId — subscribeToTableChanges shares one
    // real channel across all three rather than opening a second one.
    const unsubscribe = subscribeToTableChanges<{ new: Record<string, unknown> }>(
      `notifications-${userId}`,
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload?.new;
        if (row) showOsNotification(String(row.title ?? "Metro Health Lab"), String(row.message ?? ""));
      },
      () => {
        /* A failed toast subscription must never break the page — the in-app bell is still correct either way. */
      }
    );
    return unsubscribe;
  }, [userId]);
}

async function showOsNotification(title: string, body: string): Promise<void> {
  if (Notification.permission !== "granted") return;
  // Chrome on Android refuses `new Notification(...)` outright ("Illegal
  // constructor — use ServiceWorkerRegistration.showNotification()") —
  // this app already registers a service worker (see main.tsx/sw.js)
  // for PWA install, and any active registration can show a
  // notification through it whether or not its own script has push-
  // specific code. Try that path first; only browsers where no service
  // worker is active (desktop Safari, dev builds — sw.js only
  // registers in production) fall through to the plain constructor.
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, { body, icon: "/icons/icon-192.png" });
      return;
    } catch {
      // Fall through.
    }
  }
  try {
    new Notification(title, { body });
  } catch {
    // Nothing more to honestly try — fails silently rather than
    // throwing out of a realtime callback.
  }
}

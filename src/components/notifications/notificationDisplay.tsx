// Shared between NotificationBell's dropdown panel and the full
// NotificationsPage so the two can never visually drift apart — one
// icon map, one relative-time formatter, one row renderer, one
// grouping rule, all driven by the real NotificationType union (never
// an invented category).
import type { AppNotification, NotificationType } from "@/types/notification";

export const TYPE_ICON: Record<NotificationType, string> = {
  booking_received: "receipt_long",
  booking_confirmed: "check_circle",
  payment_successful: "payments",
  collector_assigned: "person_pin_circle",
  on_the_way: "directions_car",
  sample_collected: "colorize",
  report_ready: "description",
  cancelled: "cancel",
  refund: "currency_rupee",
  offer: "local_offer",
  system: "info",
};

/** The tab groupings NotificationsPage offers (Section 10: All/Unread/
 * Booking/Reports/Offers/System) — every real NotificationType maps to
 * exactly one, so "All" always accounts for every row. */
export type NotificationGroup = "booking" | "reports" | "offers" | "system";

export const TYPE_GROUP: Record<NotificationType, NotificationGroup> = {
  booking_received: "booking",
  booking_confirmed: "booking",
  payment_successful: "booking",
  collector_assigned: "booking",
  on_the_way: "booking",
  sample_collected: "booking",
  cancelled: "booking",
  refund: "booking",
  report_ready: "reports",
  offer: "offers",
  system: "system",
};

export function formatWhen(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Where a click should go: the booking's own tracker when one is
 * linked, an explicit action_url otherwise, or nowhere (just marks
 * read) — per this app's actual notification shape, never a guess. */
export function resolveNotificationTarget(n: AppNotification): string | null {
  if (n.bookingId) return `/track/${n.bookingId}`;
  if (n.actionUrl) return n.actionUrl;
  return null;
}

export function NotificationListItem({
  notification,
  onOpen,
  compact = false,
}: {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
  /** Smaller avatar/padding for the bell dropdown, where space is tight. */
  compact?: boolean;
}) {
  const n = notification;
  const size = compact ? 40 : 48;
  const clickable = !!resolveNotificationTarget(n) || !n.read;
  return (
    <button
      className="card mh-notification-item"
      style={{
        textAlign: "left",
        display: "flex",
        gap: "var(--space-sm)",
        alignItems: "flex-start",
        width: "100%",
        background: n.read ? "var(--color-surface)" : "var(--color-bg-tint)",
        cursor: clickable ? "pointer" : "default",
        padding: compact ? "var(--space-xs) var(--space-sm)" : undefined,
      }}
      onClick={() => onOpen(n)}
    >
      {n.imageUrl ? (
        <img
          src={n.imageUrl}
          alt=""
          style={{ width: size, height: size, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: size,
            height: size,
            borderRadius: "var(--radius-sm)",
            background: "var(--color-bg-tint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--color-primary)",
          }}
        >
          <span className="mi">{TYPE_ICON[n.type] ?? "notifications"}</span>
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontWeight: n.read ? 500 : 700, fontSize: compact ? "var(--text-sm)" : undefined }}>{n.title}</span>
          <span className="text-soft" style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
            {formatWhen(n.createdAt)}
          </span>
        </span>
        <span
          className="text-soft"
          style={{
            fontSize: "var(--text-sm)",
            display: "-webkit-box",
            WebkitLineClamp: compact ? 2 : undefined,
            WebkitBoxOrient: compact ? "vertical" : undefined,
            overflow: compact ? "hidden" : undefined,
            marginTop: 2,
          }}
        >
          {n.message}
        </span>
      </span>
      {!n.read && (
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0, marginTop: 6 }}
        />
      )}
    </button>
  );
}

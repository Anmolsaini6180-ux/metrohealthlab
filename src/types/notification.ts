export type NotificationType =
  | "booking_received"
  | "booking_confirmed"
  | "payment_successful"
  | "collector_assigned"
  | "on_the_way"
  | "sample_collected"
  | "report_ready"
  | "cancelled"
  | "refund"
  | "offer"
  | "system"
  /** Time-based reminder to a customer (24h/2h/1h/due-now/overdue) — fired by run_booking_automation(), never implies a real status change. */
  | "booking_automation"
  /** Operational alert to staff/admin (unassigned, starting soon, overdue) — same source as above, different audience. */
  | "booking_automation_alert"
  /** Sent to the office when a collection agent (not an admin) changes a booking's real status — set_booking_status()'s own "someone should know" alert. */
  | "staff_status_update";

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: unknown;
  /** Media Library asset URL, when the admin attached one — never fabricated. */
  imageUrl?: string;
  /** In-app path to navigate to on click/tap, e.g. "/track/<bookingId>". */
  actionUrl?: string;
  /** Set automatically for booking-lifecycle notifications; absent for admin broadcasts. */
  bookingId?: string;
  /** Set only for admin-sent broadcasts — absent for automatic booking-lifecycle ones. */
  sentBy?: string;
  /** Shared by every recipient of the same admin broadcast — lets the admin list group/count them as one send. */
  batchId?: string;
}

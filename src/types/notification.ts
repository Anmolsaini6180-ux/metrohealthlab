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
  | "system";

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: unknown;
}

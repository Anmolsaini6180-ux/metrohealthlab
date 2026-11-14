export interface SupportTicket {
  id: string;
  userId: string;
  bookingId?: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: unknown;
  updatedAt: unknown;
}

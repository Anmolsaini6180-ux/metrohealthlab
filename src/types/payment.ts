export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cash_on_collection";

export type PaymentStatus = "pending" | "processing" | "success" | "failed" | "refunded";

export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  gatewayOrderId?: string; // set by Cloud Function
  gatewayPaymentId?: string; // set by verified webhook
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Refund {
  id: string;
  paymentId: string;
  bookingId: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  createdAt: unknown;
}

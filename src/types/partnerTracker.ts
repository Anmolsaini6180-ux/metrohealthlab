// Partner Tracker (SUPER_ADMIN only). See supabase/partner_tracker.sql.

export type ReceivedAt = "healthians" | "self";

export interface TrackerPartner {
  id: string;
  name: string;
  phone?: string;
  commissionRate: number; // percent, 0-100
  active: boolean;
}

/** One real booking joined with its tracker facts (partner_tracker_bookings RPC). */
export interface TrackerBooking {
  bookingId: string;
  reference: string;
  date: string; // ISO date
  startAt?: string;
  bookingStatus: string;
  source: string;
  patientName: string;
  phone: string;
  city: string;
  address: string;
  items: string;
  /** bookings.final_amount — what the customer is billed. */
  billed: number;
  amountReceived: number;
  /** Sum of booking_items.tp; null when no item carries a tp. */
  itemsTp: number | null;
  partnerId: string | null;
  isTp: boolean;
  tpAmount: number | null;
  partnerPayment: number;
  labCost: number | null;
  receivedAt: ReceivedAt | null;
  notes: string;
}

export interface BookingFinanceInput {
  partnerId: string | null;
  isTp: boolean;
  tpAmount: number | null;
  partnerPayment: number;
  labCost: number | null;
  receivedAt: ReceivedAt | null;
  notes: string;
}

export interface PartnerPayout {
  id: string;
  partnerId: string;
  paidOn: string;
  amount: number;
  reference: string;
}

export interface HealthiansSettlement {
  id: string;
  direction: "in" | "out"; // in = Healthians paid us, out = we paid Healthians
  settledOn: string;
  amount: number;
  reference: string;
}

export interface AdSpendEntry {
  id: string;
  spentOn: string;
  campaign: string;
  amount: number;
  leads: number;
}

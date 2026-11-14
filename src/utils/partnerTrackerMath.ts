import type {
  AdSpendEntry,
  HealthiansSettlement,
  PartnerPayout,
  TrackerBooking,
  TrackerPartner,
} from "@/types/partnerTracker";

// All Partner Tracker money rules live here, in one place, so the
// screens only format what this returns.
//
//  Normal (partner %) booking
//    cost             = lab_cost override, else booking_items.tp, else 0
//    partner payable  = billed x partner rate / 100
//    net              = billed - cost - partner payable
//
//  TP booking (routed through Healthians)
//    tp amount        = tp_amount override, else booking_items.tp, else 0
//    partner payable  = partner payment
//    our commission   = billed - tp amount - partner payment   (= net)
//
//  Healthians balance (TP bookings only; positive = Healthians owes us)
//    payment received at Healthians -> billed - tp amount
//    payment received by us ("self") -> -tp amount  (we owe Healthians)
//
// Cancelled / refunded bookings contribute nothing.

const round2 = (n: number) => Math.round(n * 100) / 100;

export const INACTIVE_STATUSES = ["cancelled", "refunded"];

export interface BookingCalc {
  counted: boolean;
  billed: number;
  cost: number;
  partnerPayable: number;
  ourTpCommission: number;
  net: number;
  healthiansBalance: number;
}

const ZERO: BookingCalc = { counted: false, billed: 0, cost: 0, partnerPayable: 0, ourTpCommission: 0, net: 0, healthiansBalance: 0 };

export function calcBooking(b: TrackerBooking, partners: TrackerPartner[]): BookingCalc {
  if (INACTIVE_STATUSES.includes(b.bookingStatus)) return ZERO;
  const billed = b.billed;

  if (b.isTp) {
    const tp = b.tpAmount ?? b.itemsTp ?? 0;
    const ourTpCommission = round2(billed - tp - b.partnerPayment);
    const healthiansBalance = b.receivedAt === "healthians" ? round2(billed - tp) : b.receivedAt === "self" ? round2(-tp) : 0;
    return { counted: true, billed, cost: tp, partnerPayable: b.partnerPayment, ourTpCommission, net: ourTpCommission, healthiansBalance };
  }

  const cost = b.labCost ?? b.itemsTp ?? 0;
  const rate = partners.find((p) => p.id === b.partnerId)?.commissionRate ?? 0;
  const partnerPayable = round2((billed * rate) / 100);
  return { counted: true, billed, cost, partnerPayable, ourTpCommission: 0, net: round2(billed - cost - partnerPayable), healthiansBalance: 0 };
}

export interface TrackerSummary {
  bookings: number;
  cancelled: number;
  revenue: number;
  cost: number;
  partnerPayable: number;
  ourTpCommission: number;
  net: number;
  adSpend: number;
  netAfterAds: number;
  adCostPerBooking: number | null;
}

export function summarize(bookings: TrackerBooking[], partners: TrackerPartner[], ads: AdSpendEntry[]): TrackerSummary {
  let live = 0;
  const s = { revenue: 0, cost: 0, partnerPayable: 0, ourTpCommission: 0, net: 0 };
  for (const b of bookings) {
    const c = calcBooking(b, partners);
    if (!c.counted) continue;
    live += 1;
    s.revenue += c.billed;
    s.cost += c.cost;
    s.partnerPayable += c.partnerPayable;
    s.ourTpCommission += c.ourTpCommission;
    s.net += c.net;
  }
  const adSpend = ads.reduce((a, x) => a + x.amount, 0);
  return {
    bookings: bookings.length,
    cancelled: bookings.length - live,
    revenue: round2(s.revenue),
    cost: round2(s.cost),
    partnerPayable: round2(s.partnerPayable),
    ourTpCommission: round2(s.ourTpCommission),
    net: round2(s.net),
    adSpend: round2(adSpend),
    netAfterAds: round2(s.net - adSpend),
    adCostPerBooking: live > 0 ? round2(adSpend / live) : null,
  };
}

export interface PartnerLedgerRow {
  partner: TrackerPartner;
  bookings: number;
  revenue: number;
  earned: number;
  paid: number;
  outstanding: number;
}

/** All-time, not date-ranged: an outstanding balance does not reset each month. */
export function partnerLedger(bookings: TrackerBooking[], partners: TrackerPartner[], payouts: PartnerPayout[]): PartnerLedgerRow[] {
  return partners.map((partner) => {
    let n = 0;
    let revenue = 0;
    let earned = 0;
    for (const b of bookings) {
      if (b.partnerId !== partner.id) continue;
      const c = calcBooking(b, partners);
      if (!c.counted) continue;
      n += 1;
      revenue += c.billed;
      earned += c.partnerPayable;
    }
    const paid = payouts.filter((p) => p.partnerId === partner.id).reduce((a, p) => a + p.amount, 0);
    return { partner, bookings: n, revenue: round2(revenue), earned: round2(earned), paid: round2(paid), outstanding: round2(earned - paid) };
  });
}

export interface HealthiansPosition {
  toReceive: number;
  toPay: number;
  settledIn: number;
  settledOut: number;
  /** Positive = Healthians owes us. Negative = we owe Healthians. */
  net: number;
}

export function healthiansPosition(bookings: TrackerBooking[], partners: TrackerPartner[], settlements: HealthiansSettlement[]): HealthiansPosition {
  let toReceive = 0;
  let toPay = 0;
  for (const b of bookings) {
    const v = calcBooking(b, partners).healthiansBalance;
    if (v > 0) toReceive += v;
    else toPay -= v;
  }
  const settledIn = settlements.filter((s) => s.direction === "in").reduce((a, s) => a + s.amount, 0);
  const settledOut = settlements.filter((s) => s.direction === "out").reduce((a, s) => a + s.amount, 0);
  return {
    toReceive: round2(toReceive),
    toPay: round2(toPay),
    settledIn: round2(settledIn),
    settledOut: round2(settledOut),
    net: round2(toReceive - toPay - settledIn + settledOut),
  };
}

import { describe, expect, it } from "vitest";
import type { TrackerBooking, TrackerPartner } from "@/types/partnerTracker";
import { calcBooking, healthiansPosition, partnerLedger, summarize } from "./partnerTrackerMath";

const partner: TrackerPartner = { id: "p1", name: "Ravi", commissionRate: 10, active: true };

function booking(over: Partial<TrackerBooking> = {}): TrackerBooking {
  return {
    bookingId: "b1", reference: "MH-1", date: "2026-11-01", bookingStatus: "confirmed", source: "admin",
    patientName: "A", phone: "9", city: "Mumbai", address: "", items: "Pkg", billed: 1000, amountReceived: 0,
    itemsTp: null, partnerId: null, isTp: false, tpAmount: null, partnerPayment: 0, labCost: null,
    receivedAt: null, notes: "", ...over,
  };
}

describe("calcBooking", () => {
  it("TP booking: commission = billed - TP - partner payment", () => {
    const c = calcBooking(booking({ billed: 999, isTp: true, tpAmount: 574, partnerPayment: 350 }), [partner]);
    expect(c.ourTpCommission).toBe(75);
    expect(c.partnerPayable).toBe(350);
    expect(c.net).toBe(75);
  });

  it("TP falls back to the item's snapshotted tp when no override is set", () => {
    const c = calcBooking(booking({ billed: 1000, isTp: true, itemsTp: 600, partnerPayment: 100 }), [partner]);
    expect(c.ourTpCommission).toBe(300);
  });

  it("normal partner booking pays billed x rate", () => {
    const c = calcBooking(booking({ partnerId: "p1", itemsTp: 400 }), [partner]);
    expect(c.partnerPayable).toBe(100);
    expect(c.cost).toBe(400);
    expect(c.net).toBe(500);
  });

  it("own booking has no partner commission", () => {
    expect(calcBooking(booking({ labCost: 300 }), [partner]).net).toBe(700);
  });

  it("cancelled and refunded bookings count for nothing", () => {
    expect(calcBooking(booking({ bookingStatus: "cancelled", partnerId: "p1" }), [partner]).counted).toBe(false);
    expect(calcBooking(booking({ bookingStatus: "refunded" }), [partner]).net).toBe(0);
  });
});

describe("healthiansPosition", () => {
  const hb = booking({ billed: 999, isTp: true, tpAmount: 575, receivedAt: "healthians" });
  const sb = booking({ bookingId: "b2", billed: 1000, isTp: true, tpAmount: 600, receivedAt: "self" });

  it("received at Healthians: they owe billed - TP", () => {
    expect(healthiansPosition([hb], [], []).toReceive).toBe(424);
  });

  it("received by us: we owe Healthians the TP", () => {
    const p = healthiansPosition([sb], [], []);
    expect(p.toPay).toBe(600);
    expect(p.net).toBe(-600);
  });

  it("settlements reduce what is pending in each direction", () => {
    const settle = [
      { id: "1", direction: "in" as const, settledOn: "2026-11-02", amount: 100, reference: "" },
      { id: "2", direction: "out" as const, settledOn: "2026-11-03", amount: 50, reference: "" },
    ];
    expect(healthiansPosition([hb, sb], [], settle).net).toBe(424 - 600 - 100 + 50);
  });

  it("a TP booking with no receipt yet moves nothing", () => {
    expect(healthiansPosition([booking({ isTp: true, tpAmount: 500 })], [], []).net).toBe(0);
  });
});

describe("partnerLedger / summarize", () => {
  it("outstanding = earned - paid", () => {
    const rows = partnerLedger(
      [booking({ partnerId: "p1" }), booking({ bookingId: "b2", partnerId: "p1", billed: 500 })],
      [partner],
      [{ id: "x", partnerId: "p1", paidOn: "2026-11-05", amount: 50, reference: "" }]
    );
    expect(rows[0].earned).toBe(150);
    expect(rows[0].outstanding).toBe(100);
  });

  it("net after ads and ad cost per booking", () => {
    const s = summarize([booking({ labCost: 0 }), booking({ bookingId: "b2", labCost: 0 })], [partner], [
      { id: "a", spentOn: "2026-11-01", campaign: "", amount: 200, leads: 4 },
    ]);
    expect(s.net).toBe(2000);
    expect(s.netAfterAds).toBe(1800);
    expect(s.adCostPerBooking).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import { computeBookingMetrics, filterBookings, pendingFor, EMPTY_FILTERS } from "@/utils/bookingMetrics";
import type { Booking } from "@/types/booking";

function booking(partial: Partial<Booking>): Booking {
  return {
    id: "b1-uuid",
    reference: "MH-260902-00001",
    userId: "u1",
    patientId: "p1",
    items: [{ itemType: "package", refId: "pk1", name: "Full Body", labId: "l1", price: 1000 }],
    labId: "l1",
    collectionType: "home",
    date: "2026-09-02",
    slotId: "s1",
    subtotal: 1000,
    collectionFee: 0,
    discount: 0,
    finalAmount: 1000,
    amountReceived: 0,
    pendingAmount: 1000,
    paymentStatus: "pending",
    bookingStatus: "confirmed",
    source: "website",
    createdAt: null,
    updatedAt: null,
    ...partial,
  } as Booking;
}

const TODAY = new Date("2026-09-02T10:00:00");

describe("computeBookingMetrics", () => {
  it("counts an empty book as all zeroes", () => {
    const m = computeBookingMetrics([], TODAY);
    expect(m.total).toBe(0);
    expect(m.bookingValue).toBe(0);
    expect(m.pendingAmount).toBe(0);
  });

  it("splits booking value, received and pending rather than calling it all revenue", () => {
    const m = computeBookingMetrics(
      [
        booking({ finalAmount: 1000, amountReceived: 0, pendingAmount: 1000, paymentStatus: "pending" }),
        booking({ id: "MH2", finalAmount: 2000, amountReceived: 500, pendingAmount: 1500, paymentStatus: "partially_paid" }),
        booking({ id: "MH3", finalAmount: 500, amountReceived: 500, pendingAmount: 0, paymentStatus: "paid" }),
      ],
      TODAY
    );

    expect(m.bookingValue).toBe(3500);
    expect(m.amountReceived).toBe(1000);
    expect(m.pendingAmount).toBe(2500);
    expect(m.paymentPending).toBe(1);
    expect(m.partiallyPaid).toBe(1);
    expect(m.paid).toBe(1);
  });

  // Money that will never be collected is not a receivable.
  it("excludes cancelled bookings from the money totals", () => {
    const m = computeBookingMetrics(
      [
        booking({ finalAmount: 1000 }),
        booking({ id: "MH2", finalAmount: 9999, bookingStatus: "cancelled" }),
      ],
      TODAY
    );

    expect(m.total).toBe(2);
    expect(m.cancelled).toBe(1);
    expect(m.bookingValue).toBe(1000);
    expect(m.pendingAmount).toBe(1000);
  });

  it("counts today's bookings by collection date", () => {
    const m = computeBookingMetrics(
      [booking({ date: "2026-09-02" }), booking({ id: "MH2", date: "2026-09-03" })],
      TODAY
    );
    expect(m.today).toBe(1);
  });

  it("groups the operational statuses into in-progress", () => {
    const m = computeBookingMetrics(
      [
        booking({ bookingStatus: "assigned" }),
        booking({ id: "MH2", bookingStatus: "sample_collected" }),
        booking({ id: "MH3", bookingStatus: "completed" }),
      ],
      TODAY
    );
    expect(m.inProgress).toBe(2);
    expect(m.completed).toBe(1);
  });

  it("counts unassigned vs assigned among non-terminal bookings only", () => {
    const m = computeBookingMetrics(
      [
        booking({ bookingStatus: "confirmed" }), // unassigned
        booking({ id: "MH2", bookingStatus: "assigned", assignedAgentId: "agent-1" }),
        booking({ id: "MH3", bookingStatus: "cancelled" }), // terminal — excluded from both
      ],
      TODAY
    );
    expect(m.unassigned).toBe(1);
    expect(m.assigned).toBe(1);
  });

  it("counts a booking as assigned if ANY of the three assignment columns is set", () => {
    const m = computeBookingMetrics([booking({ assignedSubAdminId: "sub-1" })], TODAY);
    expect(m.assigned).toBe(1);
    expect(m.unassigned).toBe(0);
  });

  it("counts onTheWay directly from booking_status", () => {
    const m = computeBookingMetrics([booking({ bookingStatus: "on_the_way" })], TODAY);
    expect(m.onTheWay).toBe(1);
  });

  it("counts startingSoon for a real start_at within the next 2 hours, not in the past", () => {
    const now = new Date("2026-09-06T04:00:00.000Z");
    const soon = new Date(now.getTime() + 90 * 60000).toISOString();
    const tooFar = new Date(now.getTime() + 3 * 60 * 60000).toISOString();
    const past = new Date(now.getTime() - 10 * 60000).toISOString();
    const m = computeBookingMetrics(
      [
        booking({ startAt: soon }),
        booking({ id: "MH2", startAt: tooFar }),
        booking({ id: "MH3", startAt: past, bookingStatus: "confirmed" }),
      ],
      TODAY,
      now
    );
    expect(m.startingSoon).toBe(1);
  });

  it("counts overdue only when start_at has passed AND the real status hasn't progressed", () => {
    const now = new Date("2026-09-06T04:00:00.000Z");
    const past = new Date(now.getTime() - 20 * 60000).toISOString();
    const m = computeBookingMetrics(
      [
        booking({ startAt: past, bookingStatus: "confirmed" }), // overdue
        booking({ id: "MH2", startAt: past, bookingStatus: "on_the_way" }), // progressed — not overdue
        booking({ id: "MH3", startAt: past, bookingStatus: "completed" }), // terminal — not overdue
      ],
      TODAY,
      now
    );
    expect(m.overdue).toBe(1);
  });

  it("never counts a booking with no real start_at as starting soon or overdue", () => {
    const m = computeBookingMetrics([booking({ startAt: undefined })], TODAY);
    expect(m.startingSoon).toBe(0);
    expect(m.overdue).toBe(0);
  });
});

describe("pendingFor", () => {
  it("prefers the stored pending amount", () => {
    expect(pendingFor(booking({ finalAmount: 1000, amountReceived: 400, pendingAmount: 600 }))).toBe(600);
  });

  // Bookings created before the cash fields existed must still total.
  it("falls back to finalAmount minus received for older documents", () => {
    const legacy = booking({ finalAmount: 1000 });
    delete (legacy as Partial<Booking>).pendingAmount;
    delete (legacy as Partial<Booking>).amountReceived;
    expect(pendingFor(legacy)).toBe(1000);
  });

  it("never returns a negative balance", () => {
    expect(pendingFor(booking({ finalAmount: 100, amountReceived: 500, pendingAmount: -400 }))).toBe(0);
  });
});

describe("filterBookings", () => {
  const rows = [
    booking({ id: "MH1", contact: { name: "Asha Verma", phone: "9876543210" }, bookingStatus: "confirmed", paymentStatus: "pending", source: "website" }),
    booking({ id: "MH2", contact: { name: "Ravi Kumar", phone: "9000000000" }, bookingStatus: "completed", paymentStatus: "paid", source: "whatsapp" }),
    booking({ id: "MH3", bookingStatus: "cancelled", paymentStatus: "pending", source: "admin" }),
  ];

  it("returns everything with no filters", () => {
    expect(filterBookings(rows, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("searches booking id, customer name and phone", () => {
    expect(filterBookings(rows, { ...EMPTY_FILTERS, search: "MH2" }).map((b) => b.id)).toEqual(["MH2"]);
    expect(filterBookings(rows, { ...EMPTY_FILTERS, search: "asha" }).map((b) => b.id)).toEqual(["MH1"]);
    expect(filterBookings(rows, { ...EMPTY_FILTERS, search: "9000000000" }).map((b) => b.id)).toEqual(["MH2"]);
  });

  it("also searches the human-facing reference, not just the raw uuid id — what a customer actually reads out over a call", () => {
    const withRefs = [
      booking({ id: "uuid-1", reference: "MH-260902-A1B2C", contact: { name: "Asha Verma", phone: "9990001111" } }),
      booking({ id: "uuid-2", reference: "MH-260902-D4E5F", contact: { name: "Ravi Kumar", phone: "9990002222" } }),
    ];
    expect(filterBookings(withRefs, { ...EMPTY_FILTERS, search: "d4e5f" }).map((b) => b.id)).toEqual(["uuid-2"]);
    expect(filterBookings(withRefs, { ...EMPTY_FILTERS, search: "MH-260902" }).map((b) => b.id)).toEqual(["uuid-1", "uuid-2"]);
  });

  it("searches the package name", () => {
    expect(filterBookings(rows, { ...EMPTY_FILTERS, search: "full body" })).toHaveLength(3);
  });

  it("filters by booking status, payment status and source", () => {
    expect(filterBookings(rows, { ...EMPTY_FILTERS, bookingStatus: "completed" }).map((b) => b.id)).toEqual(["MH2"]);
    expect(filterBookings(rows, { ...EMPTY_FILTERS, paymentStatus: "pending" }).map((b) => b.id)).toEqual(["MH1", "MH3"]);
    expect(filterBookings(rows, { ...EMPTY_FILTERS, source: "whatsapp" }).map((b) => b.id)).toEqual(["MH2"]);
  });

  it("combines filters and search", () => {
    expect(
      filterBookings(rows, { ...EMPTY_FILTERS, paymentStatus: "pending", search: "asha" }).map((b) => b.id)
    ).toEqual(["MH1"]);
  });

  it("filters by collection date", () => {
    const dated = [
      booking({ id: "MH1", date: "2026-09-02" }),
      booking({ id: "MH2", date: "2026-09-03" }),
    ];
    expect(filterBookings(dated, { ...EMPTY_FILTERS, date: "2026-09-02" }).map((b) => b.id)).toEqual(["MH1"]);
    expect(filterBookings(dated, { ...EMPTY_FILTERS, date: "" })).toHaveLength(2);
  });

  it("treats a booking with no source as a website booking", () => {
    const legacy = [booking({ id: "MH9", source: undefined })];
    expect(filterBookings(legacy, { ...EMPTY_FILTERS, source: "website" })).toHaveLength(1);
  });

  describe("quickFilter", () => {
    const now = new Date("2026-09-06T04:00:00.000Z");
    const soon = new Date(now.getTime() + 90 * 60000).toISOString();
    const past = new Date(now.getTime() - 20 * 60000).toISOString();

    it("unassigned / assigned", () => {
      const set = [
        booking({ id: "u1", bookingStatus: "confirmed" }),
        booking({ id: "a1", bookingStatus: "assigned", assignedAgentId: "agent-1" }),
        booking({ id: "done", bookingStatus: "completed" }), // terminal — excluded from both
      ];
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "unassigned" }, now).map((b) => b.id)).toEqual(["u1"]);
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "assigned" }, now).map((b) => b.id)).toEqual(["a1"]);
    });

    it("startingSoon / overdue", () => {
      const set = [
        booking({ id: "soon", startAt: soon, bookingStatus: "confirmed" }),
        booking({ id: "late", startAt: past, bookingStatus: "confirmed" }),
        booking({ id: "handled", startAt: past, bookingStatus: "on_the_way" }), // progressed — not overdue
      ];
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "startingSoon" }, now).map((b) => b.id)).toEqual(["soon"]);
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "overdue" }, now).map((b) => b.id)).toEqual(["late"]);
    });

    it("today / tomorrow use the real calendar date, not a fixed offset", () => {
      const set = [booking({ id: "t", date: "2026-09-06" }), booking({ id: "tm", date: "2026-09-07" })];
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "today" }, now).map((b) => b.id)).toEqual(["t"]);
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "tomorrow" }, now).map((b) => b.id)).toEqual(["tm"]);
    });

    it("completed", () => {
      const set = [booking({ id: "c", bookingStatus: "completed" }), booking({ id: "nc", bookingStatus: "confirmed" })];
      expect(filterBookings(set, { ...EMPTY_FILTERS, quickFilter: "completed" }, now).map((b) => b.id)).toEqual(["c"]);
    });
  });
});

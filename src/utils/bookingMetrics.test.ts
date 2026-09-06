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
});

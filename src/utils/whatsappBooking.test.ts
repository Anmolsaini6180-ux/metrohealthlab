import { describe, expect, it } from "vitest";
import {
  buildWhatsAppBookingMessage,
  buildWhatsAppLink,
  extractAgeGender,
  formatIstSlot,
  parseAmount,
  parsePhone,
  parseWhatsAppBooking,
  splitSlotDateTime,
} from "@/utils/whatsappBooking";
import type { Booking } from "@/types/booking";

const SAMPLE = `Booking Confirmation

Booking ID: MH26082000012
Affiliate Name: Metro Health Lab
Booking Status: Confirmed
Booking Amount: ₹1,299
Paid Amount: ₹0
Sample Collection Slot: 2026-09-02 07:00-09:00
Customer Phone: +91 98765 43210
Customer Address: 12 Nehru Road, Ghaziabad
Customer Name: Asha Verma
Test Details: Metro Full Body Health Check`;

describe("parseWhatsAppBooking", () => {
  it("extracts every field from a well-formed message", () => {
    const { fields } = parseWhatsAppBooking(SAMPLE);
    expect(fields).toEqual({
      bookingRef: "MH26082000012",
      affiliateName: "Metro Health Lab",
      bookingStatus: "Confirmed",
      bookingAmount: 1299,
      paidAmount: 0,
      slot: "2026-09-02 07:00-09:00",
      slotDate: "2026-09-02",
      slotTime: "07:00-09:00",
      customerPhone: "9876543210",
      customerAddress: "12 Nehru Road, Ghaziabad",
      customerName: "Asha Verma",
      testDetails: "Metro Full Body Health Check",
    });
  });

  // A real affiliate message, exactly as pasted — different label
  // wording ("Customer phone no.", "Sample collection slot timings")
  // and an age/gender tag baked into the name.
  it("reads a real affiliate-format message end to end", () => {
    const real = `Booking Confirmation:
Please find the booking details below-
Booking ID - 20114407147
Affiliate Name: Metro health lab
Booking status: sample collector assign
Booking Amount: 1000.00
Paid Amount: 0
Sample collection slot timings: 2026-09-06 11:30:00
Customer phone no.: 8448959517
Customer Address: Vpo malikpur, najafgarh 110073, Ujwa
Customer Name: Gaurav Dagar (27/M)
Test Details: Urine Routine & Microscopy Extended,Swasthya Mitra PREMIUM`;

    const { fields } = parseWhatsAppBooking(real);
    expect(fields.bookingRef).toBe("20114407147");
    expect(fields.bookingAmount).toBe(1000);
    expect(fields.paidAmount).toBe(0);
    expect(fields.slotDate).toBe("2026-09-06");
    expect(fields.slotTime).toBe("11:30:00");
    expect(fields.customerPhone).toBe("8448959517");
    expect(fields.customerName).toBe("Gaurav Dagar");
    expect(fields.customerAge).toBe(27);
    expect(fields.customerGender).toBe("M");
    expect(fields.testDetails).toBe("Urine Routine & Microscopy Extended,Swasthya Mitra PREMIUM");
  });

  it("does not treat the heading as data", () => {
    expect(parseWhatsAppBooking(SAMPLE).unrecognisedLines).toEqual([]);
  });

  // "Paid Amount" must not be swallowed by the "amount" synonym.
  it("keeps booking amount and paid amount apart", () => {
    const { fields } = parseWhatsAppBooking("Booking Amount: 2000\nPaid Amount: 500");
    expect(fields.bookingAmount).toBe(2000);
    expect(fields.paidAmount).toBe(500);
  });

  it("accepts dash separators and WhatsApp bold markers", () => {
    const { fields } = parseWhatsAppBooking("*Customer Name* - Ravi Kumar\n_Phone_: 09876543210");
    expect(fields.customerName).toBe("Ravi Kumar");
    expect(fields.customerPhone).toBe("9876543210");
  });

  it("is order independent and case insensitive", () => {
    const { fields } = parseWhatsAppBooking("customer name: Zoya\nBOOKING ID: MH1");
    expect(fields.customerName).toBe("Zoya");
    expect(fields.bookingRef).toBe("MH1");
  });

  // Malformed input must degrade to "leave it blank for a human",
  // never to a guess.
  it("reports lines it cannot attribute instead of guessing", () => {
    const result = parseWhatsAppBooking("Booking ID: MH2\nplease collect early\nsomething else");
    expect(result.fields.bookingRef).toBe("MH2");
    expect(result.unrecognisedLines).toEqual(["please collect early", "something else"]);
  });

  it("leaves an unreadable amount absent rather than zero", () => {
    const { fields, matched } = parseWhatsAppBooking("Booking Amount: to be confirmed");
    expect(fields.bookingAmount).toBeUndefined();
    expect(matched).not.toContain("bookingAmount");
  });

  it("returns nothing useful for empty or junk input", () => {
    expect(parseWhatsAppBooking("").fields).toEqual({});
    expect(parseWhatsAppBooking("   \n  ").fields).toEqual({});
    expect(parseWhatsAppBooking("hello there").fields).toEqual({});
  });

  it("keeps the first value when a label repeats", () => {
    const { fields } = parseWhatsAppBooking("Customer Name: First\nCustomer Name: Second");
    expect(fields.customerName).toBe("First");
  });

  it("ignores a label with no value", () => {
    const { fields } = parseWhatsAppBooking("Customer Name:\nBooking ID: MH3");
    expect(fields.customerName).toBeUndefined();
    expect(fields.bookingRef).toBe("MH3");
  });
});

describe("extractAgeGender", () => {
  it("pulls a (27/M) suffix off the name, leaving the rest untouched", () => {
    expect(extractAgeGender("Gaurav Dagar (27/M)")).toEqual({ name: "Gaurav Dagar", age: 27, gender: "M" });
  });

  it("also accepts spelled-out gender and loose spacing", () => {
    expect(extractAgeGender("Asha Verma (34 / Female)")).toEqual({ name: "Asha Verma", age: 34, gender: "F" });
  });

  it("returns the name completely unchanged when there is no age/gender tag", () => {
    expect(extractAgeGender("Ravi Kumar")).toEqual({ name: "Ravi Kumar" });
  });
});

describe("splitSlotDateTime", () => {
  it("splits an ISO date + time-of-day", () => {
    expect(splitSlotDateTime("2026-09-06 11:30:00")).toEqual({ date: "2026-09-06", time: "11:30:00" });
  });

  it("splits an ISO date + a time range", () => {
    expect(splitSlotDateTime("2026-09-02 07:00-09:00")).toEqual({ date: "2026-09-02", time: "07:00-09:00" });
  });

  it("returns nothing for a slot with no leading ISO date, rather than guessing", () => {
    expect(splitSlotDateTime("Tomorrow morning")).toEqual({});
  });
});

describe("parseAmount", () => {
  it("reads the common rupee spellings", () => {
    expect(parseAmount("₹1,299")).toBe(1299);
    expect(parseAmount("Rs. 1299/-")).toBe(1299);
    expect(parseAmount("1299.00")).toBe(1299);
    expect(parseAmount("0")).toBe(0);
  });

  it("returns undefined when there is no number", () => {
    expect(parseAmount("TBC")).toBeUndefined();
    expect(parseAmount("")).toBeUndefined();
  });
});

describe("parsePhone", () => {
  it("normalises Indian numbers to ten digits", () => {
    expect(parsePhone("+91 98765 43210")).toBe("9876543210");
    expect(parsePhone("919876543210")).toBe("9876543210");
    expect(parsePhone("09876543210")).toBe("9876543210");
    expect(parsePhone("9876543210")).toBe("9876543210");
  });

  it("leaves an implausible number for a human to fix", () => {
    expect(parsePhone("12345")).toBe("12345");
  });
});

describe("formatIstSlot", () => {
  it("formats a real slot instant in IST, 12-hour with zero-padded hour", () => {
    // 00:30 UTC on 2026-09-11 = 06:00 IST (UTC+5:30) — the exact
    // "11 September 2026 at 06:00 AM" example from the spec.
    expect(formatIstSlot("2026-09-11T00:30:00.000Z", "2026-09-11")).toBe("11 September 2026 at 06:00 AM");
  });

  it("converts a PM hour correctly", () => {
    // 08:30 UTC = 14:00 IST = 2:00 PM.
    expect(formatIstSlot("2026-09-11T08:30:00.000Z", "2026-09-11")).toBe("11 September 2026 at 02:00 PM");
  });

  it("shows 12:00 AM at IST midnight, not 00:00", () => {
    // 18:30 UTC (previous day) = 00:00 IST.
    expect(formatIstSlot("2026-09-10T18:30:00.000Z", "2026-09-11")).toBe("11 September 2026 at 12:00 AM");
  });

  it("shows 12:00 PM at IST noon", () => {
    // 06:30 UTC = 12:00 IST.
    expect(formatIstSlot("2026-09-11T06:30:00.000Z", "2026-09-11")).toBe("11 September 2026 at 12:00 PM");
  });

  it("falls back to the date only when there is no exact slot instant", () => {
    expect(formatIstSlot(undefined, "2026-09-11")).toBe("11 September 2026");
  });

  it("is stable regardless of the machine's own local timezone", () => {
    // Not literally changing TZ here (no control over the test
    // runner's env), but asserting the function reads Asia/Kolkata
    // explicitly rather than Date's own local-timezone accessors —
    // this instant would print a different hour under almost any
    // other timezone if getHours()/getMinutes() had been used instead.
    expect(formatIstSlot("2026-09-11T00:30:00.000Z", "2026-09-11")).not.toContain("12:30");
  });
});

describe("buildWhatsAppBookingMessage", () => {
  const booking = {
    reference: "MH-000000012",
    items: [{ itemType: "package", refId: "p1", name: "Metro Full Body Health Check", labId: "l1", price: 1299 }],
    finalAmount: 1299,
    amountReceived: 0,
    bookingStatus: "confirmed",
    date: "2026-09-02",
    startAt: "2026-09-02T01:30:00.000Z", // 07:00 IST
    contact: { name: "Asha Verma", phone: "9876543210", address: "12 Nehru Road, Ghaziabad" },
  } as unknown as Booking;

  it("matches the exact required template, field for field", () => {
    const msg = buildWhatsAppBookingMessage(booking, "Metro Health Lab");
    expect(msg).toBe(
      [
        "🏥 *Metro Health Lab*",
        "*Booking Confirmation*",
        "",
        "Dear Asha Verma,",
        "",
        "Your health package booking has been successfully confirmed. Please find your booking details below:",
        "",
        "📋 *Booking Details*",
        "• *Booking ID:* MH-000000012",
        "• *Booking Status:* ✅ Order Booked",
        "• *Package:* Metro Full Body Health Check",
        "• *Booking Amount:* ₹1,299/-",
        "• *Paid Amount:* ₹0/-",
        "• *Pending Amount:* ₹1,299/-",
        "",
        "👤 *Customer Details*",
        "• *Name:* Asha Verma",
        "• *Contact:* 9876543210",
        "",
        "📍 *Sample Collection Address:*",
        "12 Nehru Road, Ghaziabad",
        "",
        "🕕 *Sample Collection:*",
        "2 September 2026 at 07:00 AM",
        "",
        "Thank you for choosing *Metro Health Lab*.",
        "Our collection executive will coordinate with you for sample collection.",
        "",
        "*Metro Health Lab*",
        "*Your Health, Our Priority*",
      ].join("\n")
    );
  });

  it("includes a real Age/Gender line when patient info is supplied", () => {
    const msg = buildWhatsAppBookingMessage(booking, "Metro Health Lab", { patient: { age: 34, gender: "female" } });
    expect(msg).toContain("• *Age/Gender:* 34 / F");
  });

  it("omits the Age/Gender line entirely when no patient info is supplied", () => {
    const msg = buildWhatsAppBookingMessage(booking, "Metro Health Lab");
    expect(msg).not.toContain("Age/Gender");
  });

  it("uses a configured tagline when one is provided", () => {
    const msg = buildWhatsAppBookingMessage(booking, "Metro Health Lab", { tagline: "Accurate tests. Better health." });
    expect(msg).toContain("*Accurate tests. Better health.*");
    expect(msg).not.toContain("Your Health, Our Priority");
  });

  it("reflects a part payment in the pending amount", () => {
    const msg = buildWhatsAppBookingMessage({ ...booking, amountReceived: 500 } as Booking, "Metro Health Lab");
    expect(msg).toContain("• *Paid Amount:* ₹500/-");
    expect(msg).toContain("• *Pending Amount:* ₹799/-");
  });

  it("never shows a negative pending amount", () => {
    const msg = buildWhatsAppBookingMessage({ ...booking, amountReceived: 5000 } as Booking, "Metro Health Lab");
    expect(msg).toContain("• *Pending Amount:* ₹0/-");
  });

  it("shows the real current status once a booking has moved past 'confirmed', instead of falsely claiming Order Booked", () => {
    const msg = buildWhatsAppBookingMessage({ ...booking, bookingStatus: "sample_collected" } as Booking, "Metro Health Lab");
    expect(msg).toContain("• *Booking Status:* Sample collected");
    expect(msg).not.toContain("Order Booked");
  });

  // Round trip: what we generate must be readable by our own parser.
  it("produces a message our parser can read the booking ID and amounts back from", () => {
    const msg = buildWhatsAppBookingMessage(booking, "Metro Health Lab");
    const { fields } = parseWhatsAppBooking(msg);
    expect(fields.bookingRef).toBe("MH-000000012");
    expect(fields.bookingAmount).toBe(1299);
    expect(fields.paidAmount).toBe(0);
  });

  // This is the customer-facing message text (shared over WhatsApp,
  // outside the app entirely) — tp must never reach it even though the
  // function is handed the full booking object, tp included.
  it("never includes tp, even when the booking's items carry it", () => {
    const withTp = {
      ...booking,
      items: [{ ...booking.items[0], tp: 700 }],
    } as unknown as Booking;
    const msg = buildWhatsAppBookingMessage(withTp, "Metro Health Lab");
    expect(msg).not.toContain("700");
    expect(msg.toLowerCase()).not.toContain("tp");
    expect(msg.toLowerCase()).not.toContain("margin");
  });

  it("never shows undefined/null/[object Object] even with fully missing contact", () => {
    const msg = buildWhatsAppBookingMessage({ ...booking, contact: undefined } as Booking, "Metro Health Lab");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
    expect(msg).not.toContain("[object Object]");
    expect(msg).toContain("• *Name:* Customer");
    expect(msg).toContain("Not on file — please confirm with the customer.");
    expect(msg).not.toContain("• *Contact:*");
  });
});

describe("buildWhatsAppBookingMessage — partial contact field combinations", () => {
  // A real booking always has reference/items/finalAmount/bookingStatus/
  // date (they're required on the Booking type — there is no "draft a
  // message before a booking exists" tool in this codebase, only this
  // post-confirmation message), but contact is genuinely optional and
  // varies per booking source. Each case below is a realistic
  // combination, not a synthetic one.
  const minimal = {
    reference: "MH-000000099",
    items: [{ itemType: "package", refId: "p1", name: "Full Body Checkup", labId: "l1", price: 999 }],
    finalAmount: 999,
    amountReceived: 0,
    bookingStatus: "confirmed",
    date: "2026-09-10",
  } as unknown as Booking;

  it("name only (no phone, no address)", () => {
    const msg = buildWhatsAppBookingMessage({ ...minimal, contact: { name: "Asha" } } as Booking, "Metro Health Lab");
    expect(msg).toContain("• *Name:* Asha");
    expect(msg).not.toContain("• *Contact:*");
    expect(msg).toContain("Not on file — please confirm with the customer.");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });

  it("name + phone only", () => {
    const msg = buildWhatsAppBookingMessage({ ...minimal, contact: { name: "Asha", phone: "9876543210" } } as Booking, "Metro Health Lab");
    expect(msg).toContain("• *Name:* Asha");
    expect(msg).toContain("• *Contact:* 9876543210");
    expect(msg).not.toContain("undefined");
  });

  it("package only — no contact at all", () => {
    const msg = buildWhatsAppBookingMessage({ ...minimal, contact: undefined } as Booking, "Metro Health Lab");
    expect(msg).toContain("Full Body Checkup");
    expect(msg).toContain("• *Name:* Customer");
    expect(msg).not.toContain("• *Contact:*");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });

  it("name + address only (no phone)", () => {
    const msg = buildWhatsAppBookingMessage({ ...minimal, contact: { name: "Asha", address: "12 Nehru Road" } } as Booking, "Metro Health Lab");
    expect(msg).toContain("• *Name:* Asha");
    expect(msg).toContain("12 Nehru Road");
    expect(msg).not.toContain("• *Contact:*");
    expect(msg).not.toContain("undefined");
  });

  it("complete booking — every optional field present", () => {
    const msg = buildWhatsAppBookingMessage(
      { ...minimal, contact: { name: "Asha", phone: "9876543210", address: "12 Nehru Road" } } as Booking,
      "Metro Health Lab"
    );
    expect(msg).toContain("• *Name:* Asha");
    expect(msg).toContain("• *Contact:* 9876543210");
    expect(msg).toContain("12 Nehru Road");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with the message encoded", () => {
    const link = buildWhatsAppLink("9876543210", "Booking ID: MH1");
    expect(link).toBe("https://wa.me/919876543210?text=Booking%20ID%3A%20MH1");
  });

  it("keeps an already-prefixed number as-is", () => {
    expect(buildWhatsAppLink("+91 98765 43210", "hi")).toContain("wa.me/919876543210");
  });

  it("refuses a number too short to dial", () => {
    expect(buildWhatsAppLink("12345", "hi")).toBeNull();
  });
});

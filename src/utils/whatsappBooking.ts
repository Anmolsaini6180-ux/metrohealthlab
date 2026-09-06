import type { Booking } from "@/types/booking";

// Parsing and formatting for the WhatsApp booking workflow.
//
// Both directions are pure string work so they can be proven with
// tests: nothing here touches Firestore, and parsing NEVER creates a
// booking. The admin screen shows what was extracted in editable
// fields, a human confirms it, and only then does the booking go
// through the same authoritative creation pathway as the website.

export interface ParsedWhatsAppBooking {
  bookingRef?: string;
  affiliateName?: string;
  bookingStatus?: string;
  bookingAmount?: number;
  paidAmount?: number;
  slot?: string;
  /** Just the YYYY-MM-DD portion of `slot`, when it starts with one — e.g. so a form's own date input can be filled directly. */
  slotDate?: string;
  /** Whatever follows the date in `slot` (a single time, or a range) — the part a date input can't hold. */
  slotTime?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerName?: string;
  /** Parsed out of a "Name (27/M)"-style suffix on the customer name line, if present — customerName itself is the cleaned version with this suffix removed. */
  customerAge?: number;
  customerGender?: "M" | "F";
  testDetails?: string;
}

export interface ParseResult {
  fields: ParsedWhatsAppBooking;
  /** Field names successfully extracted — drives the review screen. */
  matched: (keyof ParsedWhatsAppBooking)[];
  /** Lines the parser could not attribute to any field. */
  unrecognisedLines: string[];
}

// Label synonyms, lowercased. Real pasted messages vary in wording, so
// each field accepts several spellings rather than demanding one exact
// template. Order matters only in that longer labels are tried first,
// so "paid amount" is not swallowed by "amount".
const FIELD_LABELS: { field: keyof ParsedWhatsAppBooking; labels: string[] }[] = [
  { field: "bookingRef", labels: ["booking id", "booking no", "booking number", "booking ref", "order id", "ref"] },
  { field: "affiliateName", labels: ["affiliate name", "affiliate", "business name", "centre", "center", "branch"] },
  { field: "bookingStatus", labels: ["booking status", "status"] },
  { field: "paidAmount", labels: ["paid amount", "amount paid", "advance", "paid"] },
  { field: "bookingAmount", labels: ["booking amount", "total amount", "amount", "total", "price"] },
  {
    field: "slot",
    labels: ["sample collection slot timings", "sample collection slot", "collection slot", "slot", "appointment", "date & time", "date and time"],
  },
  { field: "customerPhone", labels: ["customer phone no.", "customer phone no", "customer phone", "phone", "mobile", "contact", "phone number"] },
  { field: "customerAddress", labels: ["customer address", "address"] },
  { field: "customerName", labels: ["customer name", "patient name", "name"] },
  { field: "testDetails", labels: ["test details", "test/package details", "package details", "tests", "test", "package"] },
];

const NUMERIC_FIELDS = new Set<keyof ParsedWhatsAppBooking>(["bookingAmount", "paidAmount"]);

/**
 * Pulls a rupee amount out of a value like "₹1,299", "Rs. 1299/-" or
 * "1299.00". Returns undefined when there is no number to read, so the
 * review screen leaves the box empty and editable rather than guessing.
 */
export function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[₹,\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!digits) return undefined;
  const value = Number(digits[0]);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

/**
 * Normalises an Indian mobile number to its 10 digits, dropping a
 * +91/91/0 prefix. Anything that is not a plausible number is returned
 * trimmed but unchanged, so a human can correct it rather than having
 * it silently mangled.
 */
export function parsePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return raw.trim();
}

// Matches a trailing "(27/M)", "(27/Male)" or "(27 / F)" age/gender tag
// some affiliate systems append to the customer name itself. Returns
// the name with that tag removed either way, so a name with no such
// tag is returned completely unchanged.
const AGE_GENDER_SUFFIX = /\s*\(\s*(\d{1,3})\s*\/\s*(m(?:ale)?|f(?:emale)?)\s*\)\s*$/i;

export function extractAgeGender(name: string): { name: string; age?: number; gender?: "M" | "F" } {
  const match = name.match(AGE_GENDER_SUFFIX);
  if (!match) return { name };
  const age = Number(match[1]);
  const gender = match[2][0].toUpperCase() === "M" ? "M" : "F";
  return { name: name.slice(0, match.index).trim(), age, gender: gender as "M" | "F" };
}

// Splits a slot value that starts with an ISO date ("2026-09-06
// 11:30:00", "2026-09-02 07:00-09:00") into the date a <input
// type="date"> can hold and whatever text describes the time — a
// single time, a range, seconds or not. A slot with no leading ISO
// date (a free-text "Tomorrow morning") returns neither, left for a
// human to read off the raw `slot` field instead of guessing.
const SLOT_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})[\sT,]+(.+)$/;

export function splitSlotDateTime(slot: string): { date?: string; time?: string } {
  const match = slot.match(SLOT_DATE_PREFIX);
  if (!match) return {};
  return { date: match[1], time: match[2].trim() };
}

function matchLabel(line: string): { field: keyof ParsedWhatsAppBooking; value: string } | null {
  // "Label: value" and "Label - value" are both common in forwarded
  // messages; "*Label:*" appears when WhatsApp bold markers survive.
  const cleaned = line.replace(/[*_~`]/g, "").trim();
  const separator = cleaned.search(/[:\-–]/);
  if (separator === -1) return null;

  const rawLabel = cleaned.slice(0, separator).trim().toLowerCase();
  const value = cleaned.slice(separator + 1).trim();
  if (!value) return null;

  for (const { field, labels } of FIELD_LABELS) {
    if (labels.includes(rawLabel)) return { field, value };
  }
  return null;
}

/**
 * Best-effort extraction from a pasted WhatsApp booking message.
 *
 * Deliberately conservative: a line it cannot attribute is reported in
 * `unrecognisedLines` rather than guessed at, and a field it cannot
 * read is simply absent so the review form leaves it blank and
 * editable. Nothing is inferred from position or ordering.
 */
export function parseWhatsAppBooking(text: string): ParseResult {
  const fields: ParsedWhatsAppBooking = {};
  const matched: (keyof ParsedWhatsAppBooking)[] = [];
  const unrecognisedLines: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const hit = matchLabel(trimmed);
    if (!hit) {
      // Boilerplate greeting/heading lines are noise, not data — with
      // or without the trailing colon/dash real messages vary on.
      const isBoilerplate =
        /^[*_~`\s]*booking confirmation[*_~`\s:]*$/i.test(trimmed) ||
        /^please find the booking details below[\s\-–]*$/i.test(trimmed);
      if (!isBoilerplate) {
        unrecognisedLines.push(trimmed);
      }
      continue;
    }

    // First occurrence wins, so a repeated label cannot overwrite a
    // value a human already sees above it.
    if (matched.includes(hit.field)) continue;

    if (NUMERIC_FIELDS.has(hit.field)) {
      const amount = parseAmount(hit.value);
      if (amount === undefined) continue;
      fields[hit.field] = amount as never;
    } else if (hit.field === "customerPhone") {
      fields.customerPhone = parsePhone(hit.value);
    } else if (hit.field === "customerName") {
      const { name, age, gender } = extractAgeGender(hit.value);
      fields.customerName = name;
      if (age !== undefined) {
        fields.customerAge = age;
        matched.push("customerAge");
      }
      if (gender !== undefined) {
        fields.customerGender = gender;
        matched.push("customerGender");
      }
    } else if (hit.field === "slot") {
      fields.slot = hit.value;
      const { date, time } = splitSlotDateTime(hit.value);
      if (date) {
        fields.slotDate = date;
        matched.push("slotDate");
      }
      if (time) {
        fields.slotTime = time;
        matched.push("slotTime");
      }
    } else {
      fields[hit.field] = hit.value as never;
    }
    matched.push(hit.field);
  }

  return { fields, matched, unrecognisedLines };
}

const STATUS_LABELS: Record<string, string> = {
  payment_pending: "Payment pending",
  confirmed: "Confirmed",
  assigned: "Collector assigned",
  on_the_way: "Collector on the way",
  arrived: "Collector arrived",
  sample_collected: "Sample collected",
  received_at_lab: "Received at lab",
  testing: "Testing",
  report_ready: "Report ready",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function rupees(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

/**
 * Builds the confirmation message for a real booking. Every value comes
 * from the booking document — nothing is templated in.
 */
export function buildWhatsAppBookingMessage(
  booking: Pick<
    Booking,
    "id" | "items" | "finalAmount" | "amountReceived" | "bookingStatus" | "date" | "contact" | "labName"
  >,
  businessName: string
): string {
  const amountReceived = booking.amountReceived ?? 0;
  const lines = [
    "Booking Confirmation",
    "",
    `Booking ID: ${booking.id}`,
    `Business: ${businessName}`,
    `Booking Status: ${STATUS_LABELS[booking.bookingStatus] ?? booking.bookingStatus}`,
    `Booking Amount: ${rupees(booking.finalAmount)}`,
    `Paid Amount: ${rupees(amountReceived)}`,
    `Pending Amount: ${rupees(Math.max(booking.finalAmount - amountReceived, 0))}`,
    `Sample Collection Slot: ${booking.date}`,
  ];

  if (booking.labName) lines.push(`Lab: ${booking.labName}`);
  if (booking.contact?.name) lines.push(`Customer Name: ${booking.contact.name}`);
  if (booking.contact?.phone) lines.push(`Customer Phone: ${booking.contact.phone}`);
  if (booking.contact?.address) lines.push(`Customer Address: ${booking.contact.address}`);

  const items = booking.items.map((i) => i.name).filter(Boolean);
  if (items.length > 0) lines.push(`Test/Package Details: ${items.join(", ")}`);

  return lines.join("\n");
}

/**
 * wa.me deep link with the message prefilled. Opening it is a human
 * action — nothing is sent automatically.
 */
export function buildWhatsAppLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

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
  customerPhone?: string;
  customerAddress?: string;
  customerName?: string;
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
  { field: "slot", labels: ["sample collection slot", "collection slot", "slot", "appointment", "date & time", "date and time"] },
  { field: "customerPhone", labels: ["customer phone", "phone", "mobile", "contact", "phone number"] },
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
      // A bare heading like "Booking Confirmation" is noise, not data.
      if (!/^[*_~`\s]*booking confirmation[*_~`\s]*$/i.test(trimmed)) {
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

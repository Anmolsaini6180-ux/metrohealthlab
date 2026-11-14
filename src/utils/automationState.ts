import type { Booking } from "@/types/booking";
import { isUnassigned, PROGRESSED_STATUSES } from "./bookingMetrics";

// A booking has TWO separate, deliberately-never-merged tracks:
//
//   - REAL STATUS (Booking.bookingStatus) changes ONLY when a real
//     person calls set_booking_status — that's what TrackBookingPage's
//     timeline already shows, and it is untouched by anything here.
//   - AUTOMATION STATE is purely a function of the clock (server
//     start_at) and staffing (assignment columns). It NEVER implies a
//     real-world event that hasn't happened — it only ever describes
//     timing/staffing ("Starting soon", "Assigning your collector"),
//     so a customer is never told a collector is on the way unless
//     bookingStatus itself genuinely says so.
//
// Thresholds mirror run_booking_automation()'s own: >2h away is a plain
// "upcoming" reminder window; inside 2h is where the backend itself
// starts caring about assignment (2h/1h/30m/15m escalations), so that
// is also where this surfaces "unassigned" rather than at every
// distance — a booking made 3 days out with no collector named yet is
// completely normal ops lead time, not something worth alarming a
// customer about.

export type AutomationState =
  | { kind: "none" }
  | { kind: "unassigned"; minutesUntil: number | null }
  | { kind: "upcoming"; hours: number; minutes: number }
  | { kind: "starting-soon"; minutes: number }
  | { kind: "due-now" }
  | { kind: "overdue"; minutesOverdue: number };

const TERMINAL = new Set<Booking["bookingStatus"]>(["cancelled", "refunded", "completed"]);

export function computeAutomationState(booking: Booking, now: Date = new Date()): AutomationState {
  // Once genuinely on_the_way/arrived/.../completed/cancelled, the real
  // status timeline already tells the whole story — a leftover "Due
  // now"/"Overdue" label at that point would be stale noise, not signal.
  if (TERMINAL.has(booking.bookingStatus) || PROGRESSED_STATUSES.has(booking.bookingStatus)) {
    return { kind: "none" };
  }

  const unassigned = isUnassigned(booking);

  if (!booking.startAt) {
    // No real time to anchor on (e.g. a WhatsApp booking with no slot
    // resolved yet) — the only honest thing left to say is staffing.
    return unassigned ? { kind: "unassigned", minutesUntil: null } : { kind: "none" };
  }

  const minutesUntil = Math.round((new Date(booking.startAt).getTime() - now.getTime()) / 60000);

  if (minutesUntil > 120) {
    return { kind: "upcoming", hours: Math.floor(minutesUntil / 60), minutes: minutesUntil % 60 };
  }
  // Once genuinely overdue, that fact outranks staffing — "this is
  // late" is the more urgent, more honest thing to tell the customer
  // than "we're still assigning someone", regardless of assignment.
  if (minutesUntil <= -15) return { kind: "overdue", minutesOverdue: -minutesUntil };
  if (unassigned) return { kind: "unassigned", minutesUntil };
  if (minutesUntil > 0) return { kind: "starting-soon", minutes: minutesUntil };
  return { kind: "due-now" };
}

export function formatAutomationState(state: AutomationState): string {
  switch (state.kind) {
    case "none":
      return "";
    case "unassigned":
      if (state.minutesUntil === null) return "We're finalizing your collection agent";
      if (state.minutesUntil <= 0) return "We're assigning your collection agent now";
      return `Assigning your collection agent — starts in ${formatMinutes(state.minutesUntil)}`;
    case "upcoming":
      return state.hours > 0 ? `Collection starts in ${state.hours}h ${state.minutes}m` : `Collection starts in ${state.minutes}m`;
    case "starting-soon":
      return `Collection starts in ${formatMinutes(state.minutes)}`;
    case "due-now":
      return "Due now — our team will begin shortly";
    case "overdue":
      return `Running a little behind — overdue by ${state.minutesOverdue}m`;
  }
}

function formatMinutes(total: number): string {
  if (total <= 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/** A rough severity tone for styling only — never used to decide what text to show. */
export function automationStateTone(state: AutomationState): "neutral" | "info" | "warning" | "danger" {
  switch (state.kind) {
    case "none":
    case "upcoming":
      return "neutral";
    case "starting-soon":
      return "info";
    case "unassigned":
    case "due-now":
      return "warning";
    case "overdue":
      return "danger";
  }
}

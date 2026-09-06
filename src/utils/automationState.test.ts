import { describe, expect, it } from "vitest";
import type { Booking } from "@/types/booking";
import { automationStateTone, computeAutomationState, formatAutomationState } from "./automationState";

const NOW = new Date("2026-09-06T04:00:00.000Z");

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: "b1",
    reference: "MH-260906-00000",
    userId: "u1",
    patientId: "p1",
    items: [],
    labId: "lab1",
    collectionType: "home",
    date: "2026-09-06",
    slotId: "slot1",
    subtotal: 500,
    collectionFee: 0,
    discount: 0,
    finalAmount: 500,
    paymentStatus: "pending",
    bookingStatus: "confirmed",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function minutesFromNow(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60000).toISOString();
}

describe("computeAutomationState", () => {
  it("is none once a real operational status has genuinely progressed — never overwritten by time", () => {
    for (const status of ["on_the_way", "arrived", "sample_collected", "received_at_lab", "testing", "report_ready"] as const) {
      const b = booking({ bookingStatus: status, startAt: minutesFromNow(-60) });
      expect(computeAutomationState(b, NOW)).toEqual({ kind: "none" });
    }
  });

  it("is none for terminal bookings regardless of start_at", () => {
    for (const status of ["cancelled", "refunded", "completed"] as const) {
      const b = booking({ bookingStatus: status, startAt: minutesFromNow(-60) });
      expect(computeAutomationState(b, NOW)).toEqual({ kind: "none" });
    }
  });

  it("is none with no start_at and an assigned collector — nothing left to say", () => {
    const b = booking({ startAt: undefined, assignedAgentId: "agent1" });
    expect(computeAutomationState(b, NOW)).toEqual({ kind: "none" });
  });

  it("is unassigned with no start_at and no one assigned", () => {
    const b = booking({ startAt: undefined });
    expect(computeAutomationState(b, NOW)).toEqual({ kind: "unassigned", minutesUntil: null });
  });

  it("shows plain upcoming beyond 2 hours even when unassigned — normal ops lead time, not alarming", () => {
    const b = booking({ startAt: minutesFromNow(3 * 60 + 10) });
    expect(computeAutomationState(b, NOW)).toEqual({ kind: "upcoming", hours: 3, minutes: 10 });
  });

  it("switches to unassigned inside the 2h window once the backend itself would start escalating", () => {
    const b = booking({ startAt: minutesFromNow(90) });
    expect(computeAutomationState(b, NOW)).toEqual({ kind: "unassigned", minutesUntil: 90 });
  });

  it("shows starting-soon inside 2h once a collector is assigned", () => {
    const b = booking({ startAt: minutesFromNow(45), assignedAgentId: "agent1" });
    expect(computeAutomationState(b, NOW)).toEqual({ kind: "starting-soon", minutes: 45 });
  });

  it("shows due-now right at and just past start", () => {
    expect(computeAutomationState(booking({ startAt: minutesFromNow(0), assignedAgentId: "a1" }), NOW)).toEqual({ kind: "due-now" });
    expect(computeAutomationState(booking({ startAt: minutesFromNow(-14), assignedAgentId: "a1" }), NOW)).toEqual({ kind: "due-now" });
  });

  it("shows overdue 15 minutes past start, assigned or not", () => {
    expect(computeAutomationState(booking({ startAt: minutesFromNow(-15), assignedAgentId: "a1" }), NOW)).toEqual({
      kind: "overdue",
      minutesOverdue: 15,
    });
    expect(computeAutomationState(booking({ startAt: minutesFromNow(-40) }), NOW)).toEqual({ kind: "overdue", minutesOverdue: 40 });
  });

  it("treats any one of the three assignment columns as assigned", () => {
    expect(computeAutomationState(booking({ startAt: minutesFromNow(45), assignedAdminId: "a1" }), NOW).kind).toBe("starting-soon");
    expect(computeAutomationState(booking({ startAt: minutesFromNow(45), assignedSubAdminId: "a1" }), NOW).kind).toBe("starting-soon");
  });
});

describe("formatAutomationState", () => {
  it("never mentions a real-world action like 'on the way' or 'arrived'", () => {
    const banned = /on the way|arrived|collected|processing|report ready/i;
    const states = [
      { kind: "none" as const },
      { kind: "unassigned" as const, minutesUntil: null },
      { kind: "unassigned" as const, minutesUntil: 90 },
      { kind: "unassigned" as const, minutesUntil: -5 },
      { kind: "upcoming" as const, hours: 2, minutes: 5 },
      { kind: "starting-soon" as const, minutes: 30 },
      { kind: "due-now" as const },
      { kind: "overdue" as const, minutesOverdue: 15 },
    ];
    for (const s of states) {
      expect(formatAutomationState(s)).not.toMatch(banned);
    }
  });

  it("formats the upcoming/starting-soon text close to the requested example wording", () => {
    expect(formatAutomationState({ kind: "starting-soon", minutes: 30 })).toBe("Collection starts in 30m");
    expect(formatAutomationState({ kind: "upcoming", hours: 0, minutes: 45 })).toBe("Collection starts in 45m");
    expect(formatAutomationState({ kind: "upcoming", hours: 2, minutes: 5 })).toBe("Collection starts in 2h 5m");
  });

  it("formats none as an empty string so a caller can hide the whole line", () => {
    expect(formatAutomationState({ kind: "none" })).toBe("");
  });
});

describe("automationStateTone", () => {
  it("escalates tone from neutral to danger", () => {
    expect(automationStateTone({ kind: "upcoming", hours: 1, minutes: 0 })).toBe("neutral");
    expect(automationStateTone({ kind: "starting-soon", minutes: 10 })).toBe("info");
    expect(automationStateTone({ kind: "due-now" })).toBe("warning");
    expect(automationStateTone({ kind: "overdue", minutesOverdue: 5 })).toBe("danger");
  });
});

import { describe, expect, it } from "vitest";
import { computeCountdown, formatCountdown } from "./countdown";

const NOW = new Date("2026-09-06T04:00:00.000Z");

describe("computeCountdown", () => {
  it("reports no-time for a booking with no resolvable start_at, never a guessed time", () => {
    expect(computeCountdown(undefined, NOW)).toEqual({ kind: "no-time" });
    expect(computeCountdown(null, NOW)).toEqual({ kind: "no-time" });
    expect(computeCountdown("not a date", NOW)).toEqual({ kind: "no-time" });
  });

  it("splits hours and minutes for something more than an hour away", () => {
    const start = new Date(NOW.getTime() + (2 * 60 + 14) * 60000).toISOString();
    expect(computeCountdown(start, NOW)).toEqual({ kind: "upcoming", hours: 2, minutes: 14 });
  });

  it("reports minutes only for something under an hour away", () => {
    const start = new Date(NOW.getTime() + 42 * 60000).toISOString();
    expect(computeCountdown(start, NOW)).toEqual({ kind: "upcoming", hours: 0, minutes: 42 });
  });

  it("reports starting-now at the exact instant", () => {
    expect(computeCountdown(NOW.toISOString(), NOW)).toEqual({ kind: "starting-now" });
  });

  it("reports overdue with real elapsed minutes once start has passed", () => {
    const start = new Date(NOW.getTime() - 18 * 60000).toISOString();
    expect(computeCountdown(start, NOW)).toEqual({ kind: "overdue", minutesOverdue: 18 });
  });
});

describe("formatCountdown", () => {
  it("formats an hours+minutes countdown", () => {
    expect(formatCountdown({ kind: "upcoming", hours: 3, minutes: 21 })).toBe("Starts in 3h 21m");
  });

  it("omits the hours segment entirely under an hour, rather than showing 0h", () => {
    expect(formatCountdown({ kind: "upcoming", hours: 0, minutes: 42 })).toBe("Starts in 42m");
  });

  it("formats starting-now and overdue", () => {
    expect(formatCountdown({ kind: "starting-now" })).toBe("Starting now");
    expect(formatCountdown({ kind: "overdue", minutesOverdue: 18 })).toBe("Overdue by 18m");
  });

  it("formats no-time as an empty string so a caller can hide the whole line", () => {
    expect(formatCountdown({ kind: "no-time" })).toBe("");
  });
});

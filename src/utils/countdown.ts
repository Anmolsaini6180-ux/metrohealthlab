// Pure display formatting for a booking's real, server-computed
// start_at. The database is the only authority on WHEN a booking
// starts (see the bookings_compute_start_at trigger) — this only turns
// that already-real instant into "starts in 2h 14m" text; it never
// decides scheduling on its own, and re-rendering this text every
// minute (see useLiveNow below) never writes anything back.

export type CountdownState =
  | { kind: "no-time" }
  | { kind: "starting-now" }
  | { kind: "upcoming"; hours: number; minutes: number }
  | { kind: "overdue"; minutesOverdue: number };

export function computeCountdown(startAt: string | null | undefined, now: Date = new Date()): CountdownState {
  if (!startAt) return { kind: "no-time" };
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return { kind: "no-time" };

  const totalMinutes = Math.round((start.getTime() - now.getTime()) / 60000);
  if (totalMinutes > 0) {
    return { kind: "upcoming", hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  }
  if (totalMinutes === 0) return { kind: "starting-now" };
  return { kind: "overdue", minutesOverdue: -totalMinutes };
}

export function formatCountdown(state: CountdownState): string {
  switch (state.kind) {
    case "no-time":
      return "";
    case "starting-now":
      return "Starting now";
    case "upcoming":
      return state.hours > 0 ? `Starts in ${state.hours}h ${state.minutes}m` : `Starts in ${state.minutes}m`;
    case "overdue":
      return `Overdue by ${state.minutesOverdue}m`;
  }
}

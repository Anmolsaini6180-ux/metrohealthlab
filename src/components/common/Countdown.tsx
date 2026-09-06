import { useEffect, useState } from "react";
import { computeCountdown, formatCountdown } from "@/utils/countdown";

/**
 * Display-only — re-renders once a minute so the text stays roughly
 * current, but the database's own start_at (and the real automation
 * engine reacting to it) is what actually drives anything. Renders
 * nothing when the booking has no resolvable start time, exactly like
 * computeCountdown's own "no-time" case, rather than showing an empty
 * or misleading countdown.
 */
export default function Countdown({ startAt, className }: { startAt: string | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const state = computeCountdown(startAt, now);
  if (state.kind === "no-time") return null;

  const tone = state.kind === "overdue" ? "var(--color-danger)" : state.kind === "starting-now" ? "var(--color-warning)" : "var(--color-ink-soft)";
  return (
    <span className={className} style={{ color: tone, fontWeight: state.kind === "overdue" ? 700 : 500 }}>
      {formatCountdown(state)}
    </span>
  );
}

export type DateRangePreset = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

export interface DateRange {
  startDate: string; // ISO date, e.g. 2026-08-20
  endDate: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  custom: "Custom",
};

export function resolveDateRange(preset: DateRangePreset, custom?: DateRange): DateRange {
  const now = new Date();

  switch (preset) {
    case "today":
      return { startDate: toIsoDate(now), endDate: toIsoDate(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { startDate: toIsoDate(y), endDate: toIsoDate(y) };
    }
    case "thisWeek": {
      const start = startOfWeek(now);
      return { startDate: toIsoDate(start), endDate: toIsoDate(now) };
    }
    case "lastWeek": {
      const thisStart = startOfWeek(now);
      const lastStart = new Date(thisStart);
      lastStart.setDate(lastStart.getDate() - 7);
      const lastEnd = new Date(thisStart);
      lastEnd.setDate(lastEnd.getDate() - 1);
      return { startDate: toIsoDate(lastStart), endDate: toIsoDate(lastEnd) };
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: toIsoDate(start), endDate: toIsoDate(now) };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
    }
    case "custom":
      return custom ?? { startDate: toIsoDate(now), endDate: toIsoDate(now) };
  }
}

/**
 * Every ISO date from startDate to endDate inclusive — lets a trend
 * chart show a continuous X axis (including real zero days) instead of
 * only the days something happened to occur. Capped at 92 days (a
 * generous ~3 months): a chart with one bar per day stops being
 * readable well before that, and this is a UI-rendering limit, not a
 * data limit — the underlying totals still cover the full range
 * regardless of how many days this returns.
 */
/** "5 Sep"-style label for a chart x-axis tick, from an ISO date string. */
export function shortDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function enumerateDays(startDate: string, endDate: string, maxDays = 92): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days: string[] = [];
  for (let d = new Date(start); d <= end && days.length < maxDays; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(toIsoDate(d));
  }
  return days;
}

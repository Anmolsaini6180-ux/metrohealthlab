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

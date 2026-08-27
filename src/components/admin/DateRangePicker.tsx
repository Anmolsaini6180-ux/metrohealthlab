import { useState } from "react";
import { DATE_RANGE_LABELS, resolveDateRange, type DateRange, type DateRangePreset } from "@/utils/dateRanges";

const PRESETS: DateRangePreset[] = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"];

interface DateRangePickerProps {
  onChange: (range: DateRange, preset: DateRangePreset) => void;
}

export default function DateRangePicker({ onChange }: DateRangePickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  function handlePresetChange(next: DateRangePreset) {
    setPreset(next);
    if (next !== "custom") {
      onChange(resolveDateRange(next), next);
    }
  }

  function handleApplyCustom() {
    if (customStart && customEnd) {
      onChange({ startDate: customStart, endDate: customEnd }, "custom");
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
      {PRESETS.map((p) => (
        <button
          key={p}
          className={preset === p ? "btn btn-primary" : "btn btn-outline"}
          onClick={() => handlePresetChange(p)}
        >
          {DATE_RANGE_LABELS[p]}
        </button>
      ))}
      {preset === "custom" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }} />
          <span>to</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }} />
          <button className="btn btn-outline" onClick={handleApplyCustom}>Apply</button>
        </div>
      )}
    </div>
  );
}

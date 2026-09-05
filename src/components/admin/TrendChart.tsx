import { useId } from "react";

interface Point {
  x: string;
  y: number;
}

interface Series {
  label: string;
  /** Any valid CSS color, typically a var(--color-...) token. */
  color: string;
  data: Point[];
}

// Lightweight inline-SVG chart — no charting library, same reasoning
// BarList already documents: a handful of admin dashboard graphs don't
// justify the bundle weight. This is BarList's sibling for genuinely
// axis-based trends (a value over time, or two series compared against
// each other) rather than a ranked top-N list, which BarList already
// covers well as a horizontal bar list.
//
// Every number rendered here is exactly what the caller computed from
// real Supabase rows — this component only lays bars/gridlines out.
export default function TrendChart({
  series,
  height = 220,
  valueFormatter = (v) => String(v),
}: {
  series: Series[];
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  const gradientId = useId();
  const labels = series[0]?.data.map((d) => d.x) ?? [];
  const hasData = labels.length > 0 && series.some((s) => s.data.some((d) => d.y > 0));

  if (!hasData) {
    return <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No data for this range.</p>;
  }

  const width = 720;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const maxValue = Math.max(1, ...series.flatMap((s) => s.data.map((d) => d.y)));
  // Round the axis ceiling up to a "nice" number so gridline labels
  // read as 100/200/300 rather than 87/174/261.
  const niceMax = niceCeiling(maxValue);
  const gridlineCount = 4;

  const groupWidth = plotWidth / Math.max(labels.length, 1);
  const barGap = 4;
  const barWidth = Math.max(2, (groupWidth - barGap * (series.length + 1)) / series.length);

  // Dense ranges (a full month) would overlap every label — show at
  // most ~8, evenly spaced, always including the first and last.
  const labelStride = Math.max(1, Math.ceil(labels.length / 8));

  function yFor(value: number): number {
    return padTop + plotHeight - (value / niceMax) * plotHeight;
  }

  return (
    <div>
      {series.length > 1 && (
        <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: 8, flexWrap: "wrap" }}>
          {series.map((s) => (
            <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--color-ink-soft)" }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={series.map((s) => s.label).join(" and ") + " over time"}>
        <defs>
          <linearGradient id={`${gradientId}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Gridlines + Y-axis value labels */}
        {Array.from({ length: gridlineCount + 1 }, (_, i) => {
          const value = (niceMax / gridlineCount) * i;
          const y = yFor(value);
          return (
            <g key={i}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} />
              <text x={padLeft - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-ink-soft)">
                {formatAxisValue(value)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {labels.map((label, i) => {
          const groupX = padLeft + i * groupWidth;
          return (
            <g key={label}>
              {series.map((s, si) => {
                const value = s.data[i]?.y ?? 0;
                const barHeight = (value / niceMax) * plotHeight;
                const x = groupX + barGap + si * (barWidth + barGap);
                const y = padTop + plotHeight - barHeight;
                // A single interpolated string, not JSX text nodes — an
                // SVG <title> only ever renders correctly with exactly
                // one text-node child; multiple children (what
                // `{a} — {b}` produces) is a real SSR/hydration warning,
                // not just a style nit.
                const tooltip = `${s.label} — ${label}: ${valueFormatter(value)}`;
                return (
                  <rect key={s.label} x={x} y={y} width={barWidth} height={Math.max(barHeight, value > 0 ? 1 : 0)} rx={2} fill={s.color}>
                    <title>{tooltip}</title>
                  </rect>
                );
              })}
              {i % labelStride === 0 && (
                <text x={groupX + groupWidth / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--color-ink-soft)">
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={padLeft} x2={width - padRight} y1={padTop + plotHeight} y2={padTop + plotHeight} stroke="var(--color-line)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function formatAxisValue(value: number): string {
  if (value >= 100000) return `${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(value));
}

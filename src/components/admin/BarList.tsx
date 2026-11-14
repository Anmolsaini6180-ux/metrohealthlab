interface BarListItem {
  label: string;
  value: number;
}

// Lightweight CSS-based bar chart — no charting library dependency
// added just for a handful of admin dashboard bars. Values are always
// whatever the caller computed from real Firestore data; this
// component only renders, never generates numbers.
export default function BarList({ items, maxItems = 8 }: { items: BarListItem[]; maxItems?: number }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = Math.max(1, ...sorted.map((i) => i.value));

  if (sorted.length === 0) {
    return <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No data for this range.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {sorted.map((item) => (
        <div key={item.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: 2 }}>
            <span>{item.label}</span>
            <span style={{ fontWeight: 600 }}>{item.value}</span>
          </div>
          <div style={{ background: "var(--color-bg-tint)", borderRadius: 999, height: 8 }}>
            <div
              style={{
                width: `${(item.value / max) * 100}%`,
                background: "var(--color-primary)",
                height: "100%",
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

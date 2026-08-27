export default function DashboardSkeleton() {
  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div className="skeleton" style={{ height: 28, width: "50%" }} />
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 220px))" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-card" style={{ textAlign: "center" }}>
            <div className="skeleton" style={{ height: 24, width: "50%", margin: "0 auto" }} />
            <div className="skeleton" style={{ height: 10, width: "70%", margin: "0 auto" }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 100, width: "100%" }} />
    </div>
  );
}

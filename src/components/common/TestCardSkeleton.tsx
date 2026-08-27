export default function TestCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" style={{ height: 16, width: "70%" }} />
      <div className="skeleton" style={{ height: 12, width: "50%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%", marginTop: 6 }} />
      <div className="skeleton" style={{ height: 10, width: "60%" }} />
    </div>
  );
}

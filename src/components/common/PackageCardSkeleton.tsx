export default function PackageCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" style={{ height: 14, width: "30%" }} />
      <div className="skeleton" style={{ height: 16, width: "75%" }} />
      <div className="skeleton" style={{ height: 12, width: "45%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%", marginTop: 6 }} />
    </div>
  );
}

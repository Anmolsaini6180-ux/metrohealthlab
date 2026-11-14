// Matches the real PackageCard's shape (image/media block on top,
// then name/meta/price lines) so loading never flashes a visibly
// different layout than the content that replaces it.
export default function PackageCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" style={{ height: 120, width: "100%", marginBottom: 10, borderRadius: "var(--radius-md)" }} />
      <div className="skeleton" style={{ height: 16, width: "75%" }} />
      <div className="skeleton" style={{ height: 12, width: "45%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%", marginTop: 6 }} />
    </div>
  );
}

// Matches the real TestCard's shape (a shorter icon-media block, then
// name/meta/price lines) so loading never flashes a visibly different
// layout than the content that replaces it.
export default function TestCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" style={{ height: 72, width: "100%", marginBottom: 10, borderRadius: "var(--radius-md)" }} />
      <div className="skeleton" style={{ height: 16, width: "70%" }} />
      <div className="skeleton" style={{ height: 12, width: "50%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%", marginTop: 6 }} />
    </div>
  );
}

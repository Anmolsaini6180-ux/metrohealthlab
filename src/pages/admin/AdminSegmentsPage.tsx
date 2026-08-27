import { useAsync } from "@/hooks/useAsync";
import { getCustomerSegments } from "@/services/adminMarketingService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";

export default function AdminSegmentsPage() {
  const result = useAsync(getCustomerSegments, []);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Customer segments</h1>

      {result.loading && <LoadingState label="Computing segments..." rows={3} />}
      {result.error && <ErrorState message={result.error} onRetry={result.retry} />}

      {result.data && (
        <>
          {result.data.approximate && (
            <div className="card" style={{ marginBottom: "var(--space-md)", background: "var(--color-bg-tint)" }}>
              <p style={{ fontSize: "var(--text-sm)" }}>
                "Returning", "No booking", and "Coupon users" are computed from the most recent{" "}
                {result.data.sampledBookings.toLocaleString()} bookings, not the full history — exact
                for smaller businesses, an approximation once booking volume exceeds that sample size.
                "All Customers" and "New Customers" are always exact.
              </p>
            </div>
          )}
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {result.data.segments.map((s) => (
              <div key={s.key} className="mh-stat-card">
                <div className="mh-stat-card__value" style={{ fontSize: "var(--text-xl)" }}>{s.count}</div>
                <p style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginTop: 4 }}>{s.label}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{s.criteria}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToActiveLabs } from "@/services/labService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function LabsPage() {
  const labs = useRealtimeQuery(subscribeToActiveLabs, []);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Compare labs</h1>
      {labs.loading && <LoadingState rows={3} />}
      {labs.error && <ErrorState message={labs.error} onRetry={labs.retry} />}
      {labs.data && labs.data.length === 0 && <EmptyState icon="storefront" title="No labs listed yet" />}
      {labs.data && labs.data.length > 0 && (
        <div className="card-grid">
          {labs.data.map((lab) => (
            <div key={lab.id} className="card">
              <p style={{ fontWeight: 600 }}>{lab.name}</p>
              {lab.description && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{lab.description}</p>}
              <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
                {lab.testIds.length} tests • {lab.packageIds.length} packages
              </p>
              {lab.address && <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>{lab.address}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useSearchParams } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { searchPackages, subscribeToPackages } from "@/services/packageService";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import PackageCard from "@/components/common/PackageCard";

export default function PackagesPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  const packages = useRealtimeQuery<import("@/types/package").HealthPackage[]>(
    (onData, onError) => {
      if (q) {
        searchPackages(q).then(onData).catch(onError);
        return () => {};
      }
      return subscribeToPackages(undefined, onData, onError);
    },
    [q]
  );

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>
        {q ? `Results for "${q}"` : "Health packages"}
      </h1>
      {packages.loading && <CardGridSkeleton count={6} variant="package" />}
      {packages.error && <ErrorState message={packages.error} onRetry={packages.retry} />}
      {packages.data && packages.data.length === 0 && (
        <EmptyState icon="inventory_2" title="No packages found" />
      )}
      {packages.data && packages.data.length > 0 && (
        <div className="card-grid">
          {packages.data.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </div>
      )}
    </div>
  );
}

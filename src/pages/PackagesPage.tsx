import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { searchPackages, subscribeToPackages } from "@/services/packageService";
import { useAsync } from "@/hooks/useAsync";
import { getAssignedMediaMap } from "@/services/mediaService";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import PackageCard from "@/components/common/PackageCard";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema } from "@/utils/seoSchema";
import type { HealthPackage } from "@/types/package";

type SortKey = "popular" | "price-asc" | "price-desc" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Popular",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  name: "Name: A to Z",
};

function sortPackages(packages: HealthPackage[], sort: SortKey): HealthPackage[] {
  if (sort === "popular") return packages;
  const sorted = [...packages];
  if (sort === "price-asc") sorted.sort((a, b) => a.sellingPrice - b.sellingPrice);
  else if (sort === "price-desc") sorted.sort((a, b) => b.sellingPrice - a.sellingPrice);
  else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export default function PackagesPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [sort, setSort] = useState<SortKey>("popular");

  const packages = useRealtimeQuery<HealthPackage[]>(
    (onData, onError) => {
      if (q) {
        searchPackages(q).then(onData).catch(onError);
        return () => {};
      }
      return subscribeToPackages(undefined, onData, onError);
    },
    [q]
  );

  const packageIds = useMemo(() => (packages.data ?? []).map((p) => p.id), [packages.data]);
  const images = useAsync(() => getAssignedMediaMap("packages", packageIds), [packageIds.join(",")]);

  const sorted = useMemo(() => sortPackages(packages.data ?? [], sort), [packages.data, sort]);

  return (
    <div className="mh2-listing">
      <Seo
        title="Health Checkup Packages — Book Online"
        description="Compare and book Metro Health Lab's health checkup packages — full body, thyroid, diabetes, women's and senior health panels — with home sample collection."
        path="/packages"
        index={!q}
        jsonLd={buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Packages", path: "/packages" }])}
      />

      <div className="mh2-listing__head">
        <div>
          <h1 className="mh2-listing__title">{q ? `Results for "${q}"` : "Health Checkup Packages"}</h1>
          {sorted.length > 0 && <p className="mh2-listing__count">{sorted.length} package{sorted.length === 1 ? "" : "s"}</p>}
        </div>

        {sorted.length > 1 && (
          <label className="mh2-listing__sort">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {packages.loading && <CardGridSkeleton count={6} variant="package" />}
      {packages.error && <ErrorState message={packages.error} onRetry={packages.retry} />}
      {packages.data && sorted.length === 0 && (
        <EmptyState icon="inventory_2" title="No packages found" description="Try a different search, or browse the full catalog." />
      )}
      {sorted.length > 0 && (
        <div className="mh2-pkg-grid" role="list">
          {sorted.map((p) => (
            <PackageCard key={p.id} pkg={p} imageUrl={images.data?.get(p.id)?.secureUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

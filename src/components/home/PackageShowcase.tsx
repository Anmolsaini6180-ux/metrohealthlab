import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { getAssignedMediaMap } from "@/services/mediaService";
import PackageCard from "@/components/common/PackageCard";
import type { HealthPackage } from "@/types/package";

interface Props {
  packages: HealthPackage[];
}

const ALL = "Popular";

export default function PackageShowcase({ packages }: Props) {
  // Chips come from the categories the packages actually have, so the
  // filter row can never offer a tab that matches nothing.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const p of packages) {
      if (p.category && !seen.includes(p.category)) seen.push(p.category);
    }
    return [ALL, ...seen];
  }, [packages]);

  const [filter, setFilter] = useState(ALL);

  const packageIds = useMemo(() => packages.map((p) => p.id), [packages]);
  const images = useAsync(() => getAssignedMediaMap("packages", packageIds), [packageIds.join(",")]);

  const visible = useMemo(
    () => (filter === ALL ? packages : packages.filter((p) => p.category === filter)),
    [packages, filter]
  );

  if (packages.length === 0) return null;

  return (
    <section className="mh2-pkg-section">
      <div className="mh-section-head">
        <div>
          <h2 className="mh-section-title">Most Booked Health Checkups</h2>
          <p className="mh-section-subtitle">Curated by Metro Health Lab</p>
        </div>
        <Link to="/packages" className="mh-section-link">
          View all
        </Link>
      </div>

      {categories.length > 1 && (
        <div className="mh-chip-row mh-hscroll" role="tablist" aria-label="Filter packages by category">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={filter === c}
              className={`mh-chip${filter === c ? " is-active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="mh2-pkg-rail" role="list">
        {visible.map((p) => (
          <PackageCard key={p.id} pkg={p} imageUrl={images.data?.get(p.id)?.secureUrl} />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
          No packages in {filter} yet.
        </p>
      )}
    </section>
  );
}

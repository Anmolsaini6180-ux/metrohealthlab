import { Link } from "react-router-dom";
import type { HealthPackage } from "@/types/package";
import { formatCurrencyInr } from "@/services/pricingService";

export default function PackageCard({ pkg }: { pkg: HealthPackage }) {
  return (
    <Link to={`/packages/${pkg.slug}`} className="card" style={{ display: "block" }}>
      {pkg.tag && (
        <span
          style={{
            display: "inline-block",
            background: "var(--color-bg-tint)",
            color: "var(--color-primary)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            marginBottom: 6,
          }}
        >
          {pkg.tag}
        </span>
      )}
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{pkg.name}</p>
      <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-sm)" }}>
        {pkg.testIds.length} tests included
      </p>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: 2 }}>Starting from</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>
          {formatCurrencyInr(pkg.sellingPrice)}
        </span>
        {pkg.mrp > pkg.sellingPrice && (
          <span className="text-soft" style={{ textDecoration: "line-through", fontSize: "var(--text-sm)" }}>
            {formatCurrencyInr(pkg.mrp)}
          </span>
        )}
      </div>
    </Link>
  );
}

import { Link } from "react-router-dom";
import type { DiagnosticTest } from "@/types/test";
import { formatCurrencyInr } from "@/services/pricingService";

export default function TestCard({ test }: { test: DiagnosticTest }) {
  return (
    <Link to={`/tests/${test.slug}`} className="card" style={{ display: "block" }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{test.name}</p>
      <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-sm)" }}>
        {test.sampleType} {test.fastingRequired ? "• Fasting required" : ""}
      </p>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: 2 }}>Starting from</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>
          {formatCurrencyInr(test.sellingPrice)}
        </span>
        {test.mrp > test.sellingPrice && (
          <span className="text-soft" style={{ textDecoration: "line-through", fontSize: "var(--text-sm)" }}>
            {formatCurrencyInr(test.mrp)}
          </span>
        )}
      </div>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
        Reports in {test.reportTat}
      </p>
    </Link>
  );
}

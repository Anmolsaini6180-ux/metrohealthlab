import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { getPackageBySlug } from "@/services/packageService";
import { subscribeToActiveLabs, subscribeToLabPricingForPackage } from "@/services/labService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { LabPricing } from "@/types/lab";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function PackageDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const pkg = useAsync(() => getPackageBySlug(slug!), [slug]);

  // Each labPricing row only stores a labId; without this the
  // "Compare labs" list showed prices with no lab name at all.
  const labs = useRealtimeQuery(subscribeToActiveLabs, []);
  const labNameById = new Map((labs.data ?? []).map((l) => [l.id, l.name]));

  const [pricingState, setPricingState] = useState<{ data: LabPricing[] | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!pkg.data) return;
    setPricingState((s) => ({ ...s, loading: true, error: null }));
    const unsubscribe = subscribeToLabPricingForPackage(
      pkg.data.id,
      (data) => setPricingState({ data, loading: false, error: null }),
      (err) => setPricingState({ data: null, loading: false, error: err.message })
    );
    return unsubscribe;
  }, [pkg.data?.id]);
  const pricing = { ...pricingState, retry: () => setPricingState((s) => ({ ...s, error: null })) };

  if (pkg.loading) return <LoadingState label="Loading package..." />;
  if (pkg.error) return <ErrorState message={pkg.error} onRetry={pkg.retry} />;
  if (!pkg.data) return <EmptyState icon="search_off" title="Package not found" />;

  const p = pkg.data;

  function bookWithLab(labId: string, price: number) {
    navigate("/book", { state: { itemType: "package", refId: p.id, name: p.name, labId, price } });
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>{p.name}</h1>
        <p className="text-soft" style={{ marginTop: 4 }}>
          {p.testIds.length} tests included • Reports in {p.reportTat}
        </p>
      </div>

      <p>{p.description}</p>

      <div>
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Compare labs</h2>
        {pricing.loading && <LoadingState rows={2} />}
        {pricing.error && <ErrorState message={pricing.error} onRetry={pricing.retry} />}
        {pricing.data && pricing.data.length === 0 && (
          <EmptyState icon="storefront" title="No labs currently offer this package" />
        )}
        {pricing.data && pricing.data.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {pricing.data.map((pr) => (
              <div
                key={pr.id}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-sm)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700 }}>{labNameById.get(pr.labId) ?? "Partner lab"}</p>
                  <p style={{ fontWeight: 600, color: "var(--color-primary)" }}>{formatCurrencyInr(pr.price)}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {pr.collectionType === "both" ? "Home & Center" : pr.collectionType} • Reports in {pr.reportTat}
                  </p>
                </div>
                <button className="btn btn-accent" onClick={() => bookWithLab(pr.labId, pr.price)}>
                  Book
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {p.faq && p.faq.length > 0 && (
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>FAQs</h2>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {p.faq.map((f, i) => (
              <div key={i} className="card">
                <p style={{ fontWeight: 600 }}>{f.question}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{f.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

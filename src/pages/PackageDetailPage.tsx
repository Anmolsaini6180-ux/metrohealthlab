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

  // Booking used to be reachable only by first picking a row out of
  // "Compare labs", which made choosing a lab a mandatory detour before
  // anyone could book at all. The headline action now books straight
  // away at the best price actually on offer, and comparing labs stays
  // available underneath for anyone who wants it.
  const cheapest = (pricing.data ?? []).reduce<LabPricing | null>(
    (best, row) => (best === null || row.price < best.price ? row : best),
    null
  );
  const bookPrice = cheapest?.price ?? p.sellingPrice;
  const bookLabId = cheapest?.labId ?? p.labIds[0] ?? "";
  const discountPercent = p.mrp > bookPrice ? Math.round(((p.mrp - bookPrice) / p.mrp) * 100) : null;

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>{p.name}</h1>
        <p className="text-soft" style={{ marginTop: 4 }}>
          {p.testIds.length} tests included • Reports in {p.reportTat}
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: "var(--space-sm)" }}>
        <p style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-2xl)", fontWeight: 800, color: "var(--color-primary)" }}>
            {formatCurrencyInr(bookPrice)}
          </span>
          {discountPercent !== null && (
            <>
              <s className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{formatCurrencyInr(p.mrp)}</s>
              <span style={{ color: "#e5484d", fontWeight: 700, fontSize: "var(--text-sm)" }}>
                {discountPercent}% OFF
              </span>
            </>
          )}
        </p>
        <button className="btn btn-primary" onClick={() => bookWithLab(bookLabId, bookPrice)}>
          Book Now
        </button>
        {cheapest && labNameById.get(cheapest.labId) && (
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Best price at {labNameById.get(cheapest.labId)} • or compare all labs below
          </p>
        )}
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

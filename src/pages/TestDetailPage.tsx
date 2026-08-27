import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { getTestBySlug } from "@/services/testService";
import { subscribeToLabPricingForTest } from "@/services/labService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { LabPricing } from "@/types/lab";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function TestDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const test = useAsync(() => getTestBySlug(slug!), [slug]);

  // Realtime — this is the customer actively deciding whether to book,
  // so a price change from the admin panel should appear without them
  // needing to refresh.
  const [pricingState, setPricingState] = useState<{ data: LabPricing[] | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!test.data) return;
    setPricingState((s) => ({ ...s, loading: true, error: null }));
    const unsubscribe = subscribeToLabPricingForTest(
      test.data.id,
      (data) => setPricingState({ data, loading: false, error: null }),
      (err) => setPricingState({ data: null, loading: false, error: err.message })
    );
    return unsubscribe;
  }, [test.data?.id]);
  const pricing = { ...pricingState, retry: () => setPricingState((s) => ({ ...s, error: null })) };

  if (test.loading) return <LoadingState label="Loading test..." />;
  if (test.error) return <ErrorState message={test.error} onRetry={test.retry} />;
  if (!test.data) return <EmptyState icon="search_off" title="Test not found" />;

  const t = test.data;

  function bookWithLab(labId: string, price: number) {
    navigate("/book", { state: { itemType: "test", refId: t.id, name: t.name, labId, price } });
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>{t.name}</h1>
        <p className="text-soft" style={{ marginTop: 4 }}>
          {t.sampleType} • {t.fastingRequired ? "Fasting required" : "No fasting required"} • Reports in{" "}
          {t.reportTat}
        </p>
      </div>

      <p>{t.description}</p>

      {t.preparation && (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Preparation</p>
          <p className="text-soft">{t.preparation}</p>
        </div>
      )}

      <div>
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>Compare labs</h2>
        {pricing.loading && <LoadingState rows={2} />}
        {pricing.error && <ErrorState message={pricing.error} onRetry={pricing.retry} />}
        {pricing.data && pricing.data.length === 0 && (
          <EmptyState icon="storefront" title="No labs currently offer this test" />
        )}
        {pricing.data && pricing.data.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {pricing.data.map((p) => (
              <div
                key={p.id}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-sm)" }}
              >
                <div>
                  <p style={{ fontWeight: 600 }}>{formatCurrencyInr(p.price)}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {p.collectionType === "both" ? "Home & Center" : p.collectionType} • Reports in {p.reportTat}
                  </p>
                </div>
                <button className="btn btn-accent" onClick={() => bookWithLab(p.labId, p.price)}>
                  Book
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {t.faq && t.faq.length > 0 && (
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-sm)" }}>FAQs</h2>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {t.faq.map((f, i) => (
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

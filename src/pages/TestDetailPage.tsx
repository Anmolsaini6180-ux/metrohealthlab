import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/useToast";
import { getTestBySlug } from "@/services/testService";
import { subscribeToActiveLabs, subscribeToLabPricingForTest } from "@/services/labService";
import { formatCurrencyInr } from "@/services/pricingService";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema, buildFaqSchema, buildProductSchema } from "@/utils/seoSchema";
import type { LabPricing } from "@/types/lab";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import CartLabSwapConfirm from "@/components/common/CartLabSwapConfirm";

export default function TestDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const cart = useCart();
  const { showToast } = useToast();
  const [pendingSwap, setPendingSwap] = useState<null | (() => void)>(null);
  const test = useAsync(() => getTestBySlug(slug!), [slug]);

  // Realtime — this is the customer actively deciding whether to book,
  // so a price change from the admin panel should appear without them
  // needing to refresh.
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

  function addToCart(labId: string, price: number, mrp: number, pricingRefId: string, labName?: string) {
    const item = { itemType: "test" as const, refId: t.id, name: t.name, price, mrp, pricingRefId, labId, labName };
    const result = cart.addItem(item);
    if (result === "added") {
      showToast(`${t.name} added to cart`);
      navigate("/cart");
    } else if (result === "already-in-cart") {
      showToast(`${t.name} is already in your cart`);
      navigate("/cart");
    } else {
      setPendingSwap(() => () => {
        cart.replaceCart(item);
        showToast(`${t.name} added to cart`);
        navigate("/cart");
      });
    }
  }

  // Compare Labs is disabled site-wide (not deleted — see LabsPage's
  // own route in App.tsx for the matching note, and PackageDetailPage's
  // identical treatment). This page used to show every lab's price as
  // its own list with a per-row "Book" button; real bug found and fixed
  // here while auditing for SEO: that list was still fully live on this
  // page even though it was removed everywhere else on the site. The
  // `pricing` subscription stays — it's what the single Book Now button
  // below uses to book at the best price actually on offer.
  const cheapest = (pricing.data ?? []).reduce<LabPricing | null>(
    (best, row) => (best === null || row.price < best.price ? row : best),
    null
  );
  const bookPrice = cheapest?.price ?? t.sellingPrice;
  const bookLabId = cheapest?.labId ?? t.labIds[0] ?? "";
  const discountPercent = t.mrp > bookPrice ? Math.round(((t.mrp - bookPrice) / t.mrp) * 100) : null;

  const canonicalPath = `/tests/${t.slug}`;
  const seoTitle = t.seoTitle || `${t.name} — Book Online`;
  const seoDescription =
    t.seoDescription ||
    `Book ${t.name} with home sample collection. ${t.sampleType} sample, reports in ${t.reportTat}. Pay Cash on Home.`;

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <Seo
        title={seoTitle}
        description={seoDescription}
        path={canonicalPath}
        jsonLd={[
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tests", path: "/tests" },
            { name: t.name, path: canonicalPath },
          ]),
          buildProductSchema({ name: t.name, description: t.description, price: bookPrice, path: canonicalPath }),
          t.faq && t.faq.length > 0 ? buildFaqSchema(t.faq) : null,
        ].filter(Boolean)}
      />
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

      <div className="card">
        {pricing.loading && <LoadingState rows={2} />}
        {pricing.error && <ErrorState message={pricing.error} onRetry={pricing.retry} />}
        {pricing.data && pricing.data.length === 0 && (
          <EmptyState icon="storefront" title="No labs currently offer this test" />
        )}
        {pricing.data && pricing.data.length > 0 && (
          <>
            <p className="mh-pkgdetail__price-row" style={{ margin: 0 }}>
              <span className="mh-pkgdetail__price">{formatCurrencyInr(bookPrice)}</span>
              {discountPercent !== null && (
                <>
                  <s className="mh-pkgdetail__mrp">{formatCurrencyInr(t.mrp)}</s>
                  <span className="mh-pkgdetail__off">{discountPercent}% OFF</span>
                </>
              )}
            </p>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "var(--space-sm)" }}
              onClick={() =>
                addToCart(bookLabId, bookPrice, t.mrp, cheapest?.id ?? "", cheapest ? labNameById.get(cheapest.labId) : undefined)
              }
            >
              Add to Cart
              <span className="mi" aria-hidden="true">arrow_forward</span>
            </button>
          </>
        )}
      </div>

      {pendingSwap && (
        <CartLabSwapConfirm
          currentLabName={cart.labName}
          onConfirm={pendingSwap}
          onCancel={() => setPendingSwap(null)}
        />
      )}

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

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { getPackageBySlug } from "@/services/packageService";
import { getTests } from "@/services/testService";
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

  // The catalogue is small enough (tens of rows) that fetching every
  // active test once and filtering client-side by the package's own
  // testIds is simpler and just as real as a bulk-by-id query would
  // be — this is what turns testIds into the actual "Includes" list
  // the reference shows, rather than a bare count.
  const allTests = useAsync(() => getTests(), []);
  const includedTests = (allTests.data ?? []).filter((t) => (pkg.data?.testIds ?? []).includes(t.id));

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

  // `pricingRefId` travels with the selection because the
  // create_website_booking RPC re-derives the price from that
  // lab_pricing row when the booking is written — the number alone is
  // never trusted client-side.
  function bookWithLab(labId: string, price: number, pricingRefId: string, labName?: string) {
    navigate("/book", {
      state: { itemType: "package", refId: p.id, name: p.name, labId, price, pricingRefId, labName },
    });
  }

  // Booking used to be reachable only by first picking a row out of
  // "Compare labs", which made choosing a lab a mandatory detour before
  // anyone could book at all. The headline action books straight away
  // at the best price actually on offer, and comparing labs stays
  // available underneath for anyone who wants it.
  const cheapest = (pricing.data ?? []).reduce<LabPricing | null>(
    (best, row) => (best === null || row.price < best.price ? row : best),
    null
  );
  const bookPrice = cheapest?.price ?? p.sellingPrice;
  const bookLabId = cheapest?.labId ?? p.labIds[0] ?? "";
  const discountPercent = p.mrp > bookPrice ? Math.round(((p.mrp - bookPrice) / p.mrp) * 100) : null;

  return (
    <div className="mh-pkgdetail">
      <div className="mh-pkgdetail__topbar">
        <button className="mh-pkgdetail__back" onClick={() => navigate(-1)} aria-label="Go back">
          <span className="mi" aria-hidden="true">arrow_back</span>
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            className="mh-pkgdetail__share"
            onClick={() => navigator.share?.({ title: p.name, url: window.location.href }).catch(() => {})}
          >
            <span className="mi" aria-hidden="true">share</span>
            Share
          </button>
        )}
      </div>

      <div>
        <div className="mh-pkgdetail__title-row">
          <h1 style={{ fontSize: "var(--text-2xl)" }}>{p.name}</h1>
          {p.tag && <span className="mh-pkgdetail__tag">{p.tag}</span>}
        </div>
        {p.description && <p className="text-soft" style={{ marginTop: 6 }}>{p.description}</p>}
      </div>

      <div className="mh-pkgdetail__stat-row">
        <span>
          <span className="mi" aria-hidden="true">science</span>
          {p.testCountOverride != null
            ? `${p.testCountOverride} Tests`
            : includedTests.length > 0
              ? `${includedTests.length}+ Tests`
              : `${p.testIds.length} Tests`}
        </span>
        {p.homeCollection && (
          <span>
            <span className="mi" aria-hidden="true">local_shipping</span>
            Home Collection
          </span>
        )}
        <span>
          <span className="mi" aria-hidden="true">schedule</span>
          Reports in {p.reportTat}
        </span>
      </div>

      <div className="mh-pkgdetail__price-card">
        <p className="mh-pkgdetail__price-row">
          <span className="mh-pkgdetail__price">{formatCurrencyInr(bookPrice)}</span>
          {discountPercent !== null && (
            <>
              <s className="mh-pkgdetail__mrp">{formatCurrencyInr(p.mrp)}</s>
              <span className="mh-pkgdetail__off">{discountPercent}% OFF</span>
            </>
          )}
        </p>
        <button
          className="btn btn-primary"
          style={{ width: "100%" }}
          onClick={() => bookWithLab(bookLabId, bookPrice, cheapest?.id ?? "", cheapest ? labNameById.get(cheapest.labId) : undefined)}
        >
          Book Now
          <span className="mi" aria-hidden="true">arrow_forward</span>
        </button>
        {cheapest && labNameById.get(cheapest.labId) && (
          <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
            Best price at {labNameById.get(cheapest.labId)} — compare all labs below
          </p>
        )}
      </div>

      {includedTests.length > 0 && (
        <div>
          <div className="mh-section-head">
            <h2 style={{ fontSize: "var(--text-lg)" }}>Tests Included ({includedTests.length})</h2>
          </div>
          <ul className="mh-pkgdetail__includes">
            {includedTests.map((t) => (
              <li key={t.id}>
                <span className="mi" aria-hidden="true">check_circle</span>
                {t.name}
              </li>
            ))}
          </ul>
        </div>
      )}

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
              <div key={pr.id} className="mh-pkgdetail__lab-row">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700 }}>{labNameById.get(pr.labId) ?? "Partner lab"}</p>
                  <p style={{ fontWeight: 600, color: "var(--color-primary)" }}>{formatCurrencyInr(pr.price)}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {pr.collectionType === "both" ? "Home & Center" : pr.collectionType} • Reports in {pr.reportTat}
                  </p>
                </div>
                <button className="btn btn-accent" onClick={() => bookWithLab(pr.labId, pr.price, pr.id, labNameById.get(pr.labId))}>
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

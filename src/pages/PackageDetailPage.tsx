import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/useToast";
import { getPackageBySlug } from "@/services/packageService";
import { getTests } from "@/services/testService";
import { getAssignedMedia } from "@/services/mediaService";
import { subscribeToActiveLabs, subscribeToLabPricingForPackage } from "@/services/labService";
import { formatCurrencyInr } from "@/services/pricingService";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema, buildFaqSchema, buildProductSchema } from "@/utils/seoSchema";
import type { LabPricing } from "@/types/lab";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import CartLabSwapConfirm from "@/components/common/CartLabSwapConfirm";
import packageFallbackImage from "@/assets/package-fallback.jpg";

export default function PackageDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const cart = useCart();
  const { showToast } = useToast();
  const [pendingSwap, setPendingSwap] = useState<null | (() => void)>(null);
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

  // The real, admin-assigned image (Admin -> Packages -> Package image,
  // via ImagePicker -> media_assets, category "packages"). Falls back
  // to the same generic stock photo PackageCard uses (see its own
  // comment) when no real one has been assigned yet — never invented
  // per-package content, just a placeholder until a real photo exists.
  const packageImage = useAsync(
    () => (pkg.data?.id ? getAssignedMedia("packages", pkg.data.id) : Promise.resolve(null)),
    [pkg.data?.id]
  );

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

  // `pricingRefId` travels with the cart item because
  // create_website_booking_cart re-derives the price from that
  // lab_pricing row when the booking is written — the number alone is
  // never trusted client-side.
  function addToCart(labId: string, price: number, mrp: number, pricingRefId: string, labName?: string) {
    const item = { itemType: "package" as const, refId: p.id, name: p.name, price, mrp, pricingRefId, labId, labName };
    const result = cart.addItem(item);
    if (result === "added") {
      showToast(`${p.name} added to cart`);
      navigate("/cart");
    } else if (result === "already-in-cart") {
      showToast(`${p.name} is already in your cart`);
      navigate("/cart");
    } else {
      // Cart already holds an item from a different lab — a booking is
      // fulfilled by one lab visit, so confirm swapping it rather than
      // silently discarding what's already there.
      setPendingSwap(() => () => {
        cart.replaceCart(item);
        showToast(`${p.name} added to cart`);
        navigate("/cart");
      });
    }
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

  const canonicalPath = `/packages/${p.slug}`;
  const seoTitle = p.seoTitle || `${p.name} — Book Online`;
  const seoDescription =
    p.seoDescription ||
    `${p.name}: ${includedTests.length > 0 ? `${includedTests.length}+ tests, ` : ""}reports in ${p.reportTat}${p.homeCollection ? ", with home sample collection" : ""}. Pay Cash on Home.`;

  return (
    <div className="mh-pkgdetail">
      <Seo
        title={seoTitle}
        description={seoDescription}
        path={canonicalPath}
        jsonLd={[
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Packages", path: "/packages" },
            { name: p.name, path: canonicalPath },
          ]),
          buildProductSchema({ name: p.name, description: p.description || seoDescription, price: bookPrice, path: canonicalPath }),
          p.faq && p.faq.length > 0 ? buildFaqSchema(p.faq) : null,
        ].filter(Boolean)}
      />
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

      <img
        className="mh-pkgdetail__image"
        src={packageImage.data?.secureUrl ?? packageFallbackImage}
        alt={packageImage.data?.altText || ""}
      />

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
          onClick={() =>
            addToCart(bookLabId, bookPrice, p.mrp, cheapest?.id ?? "", cheapest ? labNameById.get(cheapest.labId) : undefined)
          }
        >
          Add to Cart
          <span className="mi" aria-hidden="true">arrow_forward</span>
        </button>
        {cheapest && labNameById.get(cheapest.labId) && (
          <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
            {/* Real bug fixed here: this used to say "...compare all
                labs below", promising a list that was removed when
                Compare Labs was disabled site-wide (see the comment
                further down) — leaving customers looking for a section
                that no longer exists. */}
            Best price at {labNameById.get(cheapest.labId)}
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

      {/* "Compare labs" list is disabled site-wide (not deleted — see
          LabsPage's own route in App.tsx for the matching note). The
          `pricing` subscription above it stays: bookPrice/bookLabId/
          cheapest, used by the "Add to Cart" button, are computed from
          it regardless of whether this list renders. */}

      {pendingSwap && (
        <CartLabSwapConfirm
          currentLabName={cart.labName}
          onConfirm={pendingSwap}
          onCancel={() => setPendingSwap(null)}
        />
      )}

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

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { subscribeToOffers } from "@/services/contentService";
import { discountLabel, liveOffers, validityLabel } from "@/utils/offerWindow";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema } from "@/utils/seoSchema";

// Every offer shown here is admin-controlled: created and edited under
// Admin -> Marketing -> Offers, and filtered to the ones that are both
// enabled and inside their validity window (see utils/offerWindow).
// Nothing about this page is hardcoded.
export default function OffersPage() {
  const offers = useRealtimeQuery(subscribeToOffers, []);
  const visible = useMemo(() => liveOffers(offers.data ?? []), [offers.data]);

  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <Seo
        title="Offers & Deals on Diagnostic Tests"
        description="Current discounts on Metro Health Lab's diagnostic tests and health checkup packages."
        path="/offers"
        jsonLd={buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Offers", path: "/offers" }])}
      />
      <div>
        <h1 className="mh-section-title" style={{ fontSize: "var(--text-2xl)", marginBottom: 4 }}>
          Offers &amp; deals
        </h1>
        <p className="mh-section-subtitle">Current savings on tests and health packages</p>
      </div>

      {offers.loading && <LoadingState rows={3} label="Loading offers..." />}
      {offers.error && <ErrorState message={offers.error} onRetry={offers.retry} />}

      {offers.data && visible.length === 0 && (
        <EmptyState
          icon="local_offer"
          title="No offers running right now"
          description="Check back soon — new offers appear here as soon as they go live."
          action={{ label: "Browse packages", onClick: () => { window.location.href = "/packages"; } }}
        />
      )}

      {visible.length > 0 && (
        <div className="card-grid">
          {visible.map((offer) => {
            const discount = discountLabel(offer);
            const validity = validityLabel(offer);
            return (
              <article key={offer.id} className="card mh-offer">
                {offer.imageUrl && (
                  <img className="mh-offer__image" src={offer.imageUrl} alt="" loading="lazy" />
                )}
                <div className="mh-offer__head">
                  {discount && <span className="mh-offer__badge">{discount}</span>}
                  {offer.featured && <span className="mh-pkg-card__tag">Featured</span>}
                </div>
                <h2 className="mh-offer__title">{offer.title}</h2>
                {offer.subtitle && <p className="mh-offer__subtitle">{offer.subtitle}</p>}
                {offer.description && <p className="mh-offer__text">{offer.description}</p>}
                {offer.couponCode && (
                  <p className="mh-offer__coupon">
                    Use code <strong>{offer.couponCode}</strong> at checkout
                  </p>
                )}
                {validity && <p className="mh-offer__validity">{validity}</p>}
                <Link className="mh-pkg-card__cta" to="/packages">
                  Browse packages
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

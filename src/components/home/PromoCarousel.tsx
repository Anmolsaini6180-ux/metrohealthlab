import { Link } from "react-router-dom";
import { discountLabel, validityLabel } from "@/utils/offerWindow";
import type { Offer } from "@/types/content";

// Horizontally-scrollable promo strip, surfacing the SAME live,
// admin-managed offers OffersPage already shows in full — nothing new
// to configure, no separate "homepage banner" content type invented
// for this. Caller is expected to have already filtered to live
// offers (liveOffers()) the same way OffersPage does.
export default function PromoCarousel({ offers }: { offers: Offer[] }) {
  if (offers.length === 0) return null;

  return (
    <section className="mh-promo-carousel">
      <div className="mh-section-head">
        <h2 className="mh-section-title">Stay Ahead of Your Health</h2>
        <Link to="/offers" className="mh-section-link">
          View all
        </Link>
      </div>
      <div className="mh-promo-carousel__track">
        {offers.map((offer) => {
          const discount = discountLabel(offer);
          const validity = validityLabel(offer);
          return (
            <Link key={offer.id} to="/offers" className="mh-promo-card">
              {offer.imageUrl && <img className="mh-promo-card__image" src={offer.imageUrl} alt="" loading="lazy" />}
              <div className="mh-promo-card__body">
                {discount && <span className="mh-promo-card__badge">{discount}</span>}
                <p className="mh-promo-card__title">{offer.title}</p>
                {offer.subtitle && <p className="mh-promo-card__subtitle">{offer.subtitle}</p>}
                {validity && <p className="mh-promo-card__validity">{validity}</p>}
                <span className="mh-promo-card__cta">
                  Explore Packages
                  <span className="mi" aria-hidden="true">
                    arrow_forward
                  </span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

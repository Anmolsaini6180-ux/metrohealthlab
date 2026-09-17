import { Link } from "react-router-dom";

// The deep-blue reassurance strip that sits between the category rail
// and the package showcase. Static copy on purpose: it describes how
// the service itself works (home collection, accredited partner labs),
// not a promotion, so there is nothing here for an admin to keep in
// sync — offers and campaigns live in `banners`/`offers` instead.
export default function DoorstepPromo() {
  return (
    <section className="mh-doorstep-promo">
      <span className="mh-doorstep-promo__icon" aria-hidden="true">
        <span className="mi">verified_user</span>
      </span>
      <div className="mh-doorstep-promo__copy">
        <p className="mh-doorstep-promo__title">Healthcare at Your Doorstep</p>
        <p className="mh-doorstep-promo__sub">Safe, reliable &amp; hassle-free diagnostics</p>
      </div>
      <Link to="/home-collection" className="mh-doorstep-promo__cta">
        Know More
        <span className="mi" aria-hidden="true">arrow_forward</span>
      </Link>
    </section>
  );
}

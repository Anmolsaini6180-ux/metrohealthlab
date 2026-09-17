import { Link } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";

// Design system v2 footer — a real brand block (logo, tagline, actual
// configured contact/social) instead of a bare link grid, with
// deliberate visual weight (dark navy) to close the page the way a
// premium marketplace's footer does, not trail off as an afterthought.
// Root keeps the "mh-footer" class so the existing bottom-nav safe-
// area padding rule (global.css) still applies — that's a layout
// concern, unrelated to this visual rebuild.
export default function Footer() {
  const { settings } = useBrandingSettings();
  const instagram = settings?.socialLinks?.instagram;

  return (
    <footer className="mh-footer mh2-footer">
      <div className="container mh2-footer__inner">
        <div className="mh2-footer__top">
          <div className="mh2-footer__brand">
            <Logo variant="full" height={40} className="mh2-footer__logo" />
            <p className="mh2-footer__tagline">{settings?.tagline ?? "Accurate tests. Better health."}</p>
            {settings?.aboutText && <p className="mh2-footer__about">{settings.aboutText.slice(0, 160)}{settings.aboutText.length > 160 ? "…" : ""}</p>}
            {instagram && (
              <a href={instagram} target="_blank" rel="noopener noreferrer" className="mh2-footer__social" aria-label="Metro Health Lab on Instagram">
                <span className="mi" aria-hidden="true">photo_camera</span>
              </a>
            )}
          </div>

          <nav className="mh2-footer__col" aria-label="Tests and packages">
            <p className="mh2-footer__col-title">Explore</p>
            <Link to="/tests">Tests</Link>
            <Link to="/packages">Packages</Link>
            <Link to="/health-concerns">Health Checkups</Link>
            <Link to="/offers">Offers</Link>
            <Link to="/articles">Health Articles</Link>
          </nav>

          <nav className="mh2-footer__col" aria-label="Account">
            <p className="mh2-footer__col-title">Your Account</p>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/bookings">My Bookings</Link>
            <Link to="/reports">My Reports</Link>
            <Link to="/track-booking">Track Booking</Link>
          </nav>

          <nav className="mh2-footer__col" aria-label="Company">
            <p className="mh2-footer__col-title">Company</p>
            <Link to="/about">About Us</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/support">Support</Link>
          </nav>

          <nav className="mh2-footer__col" aria-label="Legal">
            <p className="mh2-footer__col-title">Legal</p>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/refund-policy">Cancellation &amp; Refund</Link>
          </nav>

          {settings && (settings.phone || settings.email || settings.address) && (
            <div className="mh2-footer__col">
              <p className="mh2-footer__col-title">Contact</p>
              {settings.phone && (
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
                  <span className="mi" aria-hidden="true">call</span> {settings.phone}
                </a>
              )}
              {settings.email && (
                <a href={`mailto:${settings.email}`}>
                  <span className="mi" aria-hidden="true">mail</span> {settings.email}
                </a>
              )}
              {settings.address && (
                <span className="mh2-footer__address">
                  <span className="mi" aria-hidden="true">location_on</span> {settings.address}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mh2-footer__bottom">
          <span>© {new Date().getFullYear()} {settings?.businessName ?? "Metro Health Lab"}. All rights reserved.</span>
          <span className="mh2-footer__pay-note">Cash on Home — pay when your sample is collected.</span>
        </div>
      </div>
    </footer>
  );
}

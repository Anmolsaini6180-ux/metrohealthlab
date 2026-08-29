import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Logo from "@/components/brand/Logo";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";

export default function Header() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { settings } = useBrandingSettings();
  const [q, setQ] = useState("");

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/tests?q=${encodeURIComponent(q.trim())}`);
  }

  const firstName = profile?.name?.split(" ")[0];
  // Shown next to the wordmark on mobile. Comes from Branding Settings
  // so it reflects the business the admin configured, and simply does
  // not render when no address has been set.
  const city = settings?.city?.trim();

  return (
    <header className="mh-header">
      {/* Desktop bar: logo + full nav + search + icons, all one row */}
      <div className="container mh-header__desktop-row">
        <Link to="/" className="mh-header__logo" aria-label="Metro Health Lab home">
          <span className="mh-header__logo-full">
            <Logo variant="compact" height={40} />
          </span>
          <span className="mh-header__logo-icon">
            <Logo variant="icon" height={32} />
          </span>
        </Link>

        <nav className="mh-header__nav">
          <Link to="/tests">Tests</Link>
          <Link to="/packages">Packages</Link>
          <Link to="/offers">Offers</Link>
          <Link to="/labs">Compare Labs</Link>
          <Link to="/health-concerns">Health Concerns</Link>
          <Link to="/radiology">Radiology</Link>
          <Link to="/articles">Articles</Link>
        </nav>

        <form className="mh-header__search" onSubmit={handleSearchSubmit} role="search">
          <label className="visually-hidden" htmlFor="search-input-desktop">
            Search tests and packages
          </label>
          <div style={{ position: "relative" }}>
            <span className="mi mh-header__search-icon" aria-hidden="true">search</span>
            <input
              id="search-input-desktop"
              type="search"
              placeholder="Search tests, packages, health concerns..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mh-header__search-input"
            />
          </div>
        </form>

        <div className="mh-header__icons">
          <NotificationBell />
          <ProfileMenu />
        </div>
      </div>

      {/* Mobile hero: logo+wordmark and icons on top, greeting below,
          search styled as a floating card — matches the original
          product's mobile layout. Hidden at desktop widths. */}
      <div className="mh-header__mobile-hero">
        <div className="mh-header__mobile-top">
          <Link to="/" className="mh-header__wordmark" aria-label="Metro Health Lab home">
            <Logo variant="icon" height={40} />
            <span>
              <span className="mh-header__wordmark-text">
                Metro <span className="mh-header__wordmark-accent">health</span>
              </span>
              {city && (
                <span className="mh-header__city">
                  <span className="mi" aria-hidden="true">location_on</span>
                  {city}
                </span>
              )}
            </span>
          </Link>
          <div className="mh-header__icons">
            <NotificationBell />
            <Link to="/bookings" className="icon-btn" aria-label="My bookings">
              <span className="mi" aria-hidden="true">assignment</span>
            </Link>
            <ProfileMenu />
          </div>
        </div>

        <p className="mh-header__greeting">
          {firstName ? `Hi, ${firstName} 👋` : "Welcome 👋"} — <span className="text-soft">what are we checking today?</span>
        </p>

        <form onSubmit={handleSearchSubmit} role="search" className="mh-header__mobile-search-form">
          <label className="visually-hidden" htmlFor="search-input-mobile">
            Search tests and packages
          </label>
          <div className="mh-header__mobile-search">
            <span className="mi" style={{ color: "var(--color-primary)" }} aria-hidden="true">search</span>
            <input
              id="search-input-mobile"
              type="search"
              placeholder="Search for tests, packages, scans..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: "var(--text-sm)" }}
            />
            <button type="submit" className="mh-header__search-filter" aria-label="Search">
              <span className="mi" aria-hidden="true">tune</span>
            </button>
          </div>
        </form>
      </div>
    </header>
  );
}

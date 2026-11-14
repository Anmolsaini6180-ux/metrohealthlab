import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { adminHomePathForRole, adminMenuLabelForRole } from "@/utils/roleAccess";
import Logo from "@/components/brand/Logo";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";
import CartIcon from "./CartIcon";
import HeaderCallButton from "./HeaderCallButton";
import SearchAutocomplete from "@/components/common/SearchAutocomplete";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";

export default function Header() {
  const { profile } = useAuth();
  const { role } = useAdminRole();
  const adminPath = adminHomePathForRole(role);
  const { settings } = useBrandingSettings();

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
          <Link to="/health-concerns">Health Concerns</Link>
          <Link to="/articles">Articles</Link>
          {/* Desktop only, deliberately: the mobile icon row is already
              at capacity (a 4th icon there once pushed the wordmark to
              two lines at 375px, see HeaderCallButton's own history) —
              staff on mobile still reach it via the profile menu /
              Profile page, both already role-gated the same way this
              is. Desktop has room for it to be genuinely visible
              rather than tucked in a dropdown. */}
          {adminPath && (
            <Link to={adminPath} className="mh-header__admin-link">
              <span className="mi" aria-hidden="true">admin_panel_settings</span>
              {adminMenuLabelForRole(role)}
            </Link>
          )}
        </nav>

        <SearchAutocomplete
          id="search-input-desktop"
          placeholder="Search tests, packages, health concerns..."
          className="mh-header__search"
          inputClassName="mh-header__search-input"
        />

        <div className="mh-header__icons">
          <HeaderCallButton />
          <CartIcon />
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
            <HeaderCallButton />
            <NotificationBell />
            {/* No bookings or cart icon here: the mobile bottom nav
                already has a Bookings tab, and a 4th icon here (tried
                with Cart while building the cart feature) confirmed the
                wordmark still wraps to two lines at 375px — the cart is
                reached from the toast shown right after Add to Cart, or
                the persistent icon in the desktop header. */}
            <ProfileMenu />
          </div>
        </div>

        <p className="mh-header__greeting">
          {firstName ? `Hi, ${firstName} 👋` : "Welcome 👋"} — <span className="text-soft">what are we checking today?</span>
        </p>

        <SearchAutocomplete
          id="search-input-mobile"
          placeholder="Search for tests, packages, scans..."
          className="mh-header__mobile-search-form"
          inputClassName="mh-header__mobile-search-input"
        />
      </div>
    </header>
  );
}

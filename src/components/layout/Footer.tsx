import { Link } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";

export default function Footer() {
  const { settings } = useBrandingSettings();

  return (
    <footer className="mh-footer">
      <div className="container">
        <Logo variant="compact" height={32} />

        <div className="mh-footer__grid">
          <div>
            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: "var(--text-sm)" }}>Explore</p>
            <Link to="/tests">Tests</Link>
            <Link to="/packages">Packages</Link>
            <Link to="/offers">Offers</Link>
            <Link to="/labs">Compare labs</Link>
            <Link to="/health-concerns">Health concerns</Link>
            <Link to="/radiology">Radiology</Link>
          </div>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: "var(--text-sm)" }}>Account</p>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/bookings">My bookings</Link>
            <Link to="/reports">My reports</Link>
            <Link to="/support">Support</Link>
          </div>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: "var(--text-sm)" }}>Company</p>
            <Link to="/about">About us</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/articles">Articles</Link>
          </div>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: "var(--text-sm)" }}>Legal</p>
            <Link to="/privacy">Privacy policy</Link>
            <Link to="/terms">Terms of service</Link>
            <Link to="/refund-policy">Refund policy</Link>
          </div>
          {settings && (settings.phone || settings.email || settings.whatsapp || settings.address) && (
            <div>
              <p style={{ fontWeight: 600, marginBottom: 6, fontSize: "var(--text-sm)" }}>Contact</p>
              {settings.phone && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{settings.phone}</p>}
              {settings.whatsapp && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>WhatsApp: {settings.whatsapp}</p>}
              {settings.email && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{settings.email}</p>}
              {settings.address && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{settings.address}</p>}
            </div>
          )}
        </div>

        <div className="mh-footer__bottom">
          <span>© {new Date().getFullYear()} {settings?.businessName ?? "Metro Health Lab"}. All rights reserved.</span>
          <span>{settings?.tagline ?? "Accurate tests. Better health."}</span>
        </div>
      </div>
    </footer>
  );
}

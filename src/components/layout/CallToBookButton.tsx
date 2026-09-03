import { useLocation } from "react-router-dom";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";

// Floating "call us" card, for customers who would rather talk to
// someone than complete the booking flow themselves.
//
// HOME ONLY. This is a full-width fixed card, so on any page with its
// own primary action near the bottom (the Log in button, the booking
// flow's Continue) it would sit directly on top of that control — the
// old compact pill was right-aligned and small enough not to. The
// reference design places this on the landing page for the same
// reason, so it is scoped here rather than layered over every route.
//
// Renders only when Branding Settings actually holds a phone number —
// a call button that dials nothing is worse than no button at all, so
// this stays hidden until an admin sets one.
export default function CallToBookButton() {
  const { settings } = useBrandingSettings();
  const { pathname } = useLocation();
  const phone = settings?.phone?.trim();

  if (pathname !== "/") return null;
  if (!phone) return null;

  // Strip formatting for the tel: target while keeping the admin's own
  // formatting for anything shown on screen.
  const dial = phone.replace(/[^\d+]/g, "");
  if (!dial) return null;

  return (
    <a className="mh-call-card" href={`tel:${dial}`} aria-label={`Call ${phone} to book`}>
      <span className="mh-call-card__icon" aria-hidden="true">
        <span className="mi">call</span>
      </span>
      <span className="mh-call-card__copy">
        <span className="mh-call-card__lead">Need help booking a test?</span>
        <span className="mh-call-card__main">Call our health experts</span>
      </span>
      <span className="mh-call-card__cta">
        <span className="mi" aria-hidden="true">call</span>
        Call Now
      </span>
    </a>
  );
}

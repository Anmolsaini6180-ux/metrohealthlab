import { useBrandingSettings } from "@/hooks/useBrandingSettings";

// Floating "Call to Book" action, for customers who would rather talk
// to someone than complete the booking flow.
//
// Renders only when Branding Settings actually holds a phone number —
// a call button that dials nothing is worse than no button at all, so
// this stays hidden until an admin sets one.
export default function CallToBookButton() {
  const { settings } = useBrandingSettings();
  const phone = settings?.phone?.trim();
  if (!phone) return null;

  // Strip formatting for the tel: target while keeping the admin's own
  // formatting for anything shown on screen.
  const dial = phone.replace(/[^\d+]/g, "");
  if (!dial) return null;

  return (
    <a className="mh-call-fab" href={`tel:${dial}`} aria-label={`Call ${phone} to book`}>
      <span className="mi" aria-hidden="true">call</span>
      <span>Call to Book</span>
    </a>
  );
}

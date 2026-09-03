import { useBrandingSettings } from "@/hooks/useBrandingSettings";

// The header's direct-dial action, matching the reference's call icon
// beside the notification bell. Diagnostics is a phone-heavy business,
// so a one-tap dial from every page is a real convenience rather than
// decoration.
//
// Renders nothing until Branding Settings holds a phone number — the
// same rule CallToBookButton follows, so the header can never show a
// button that dials nowhere.
export default function HeaderCallButton() {
  const { settings } = useBrandingSettings();
  const phone = settings?.phone?.trim();
  if (!phone) return null;

  const dial = phone.replace(/[^\d+]/g, "");
  if (!dial) return null;

  return (
    <a className="icon-btn" href={`tel:${dial}`} aria-label={`Call ${phone}`}>
      <span className="mi" aria-hidden="true">call</span>
    </a>
  );
}

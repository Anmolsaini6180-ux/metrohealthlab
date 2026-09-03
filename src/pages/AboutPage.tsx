import { useBrandingSettings } from "@/hooks/useBrandingSettings";

// A generic-but-true fallback used only until an admin writes real copy
// in Admin -> Branding settings -> "About Us page content". It never
// claims a founding year, team size, or history we have no source for
// - only describes functionality this app actually has.
const DEFAULT_ABOUT =
  "We connect you with trusted diagnostic labs for home sample collection and center visits. " +
  "Compare pricing across labs, book a convenient slot, and track your sample live from pickup " +
  "all the way to your report.";

export default function AboutPage() {
  const { settings } = useBrandingSettings();
  const name = settings?.businessName ?? "Metro Health Lab";

  return (
    <article className="mh-static-page">
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>About {name}</h1>
      <p className="text-soft">{settings?.aboutText?.trim() || DEFAULT_ABOUT}</p>

      {settings && (settings.phone || settings.email || settings.address || settings.whatsapp) && (
        <div className="mh-static-page__contact">
          <h2 style={{ fontSize: "var(--text-lg)" }}>Reach us</h2>
          <dl className="mh-static-page__dl">
            {settings.phone && (
              <div>
                <dt>Phone</dt>
                <dd><a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>{settings.phone}</a></dd>
              </div>
            )}
            {settings.whatsapp && (
              <div>
                <dt>WhatsApp</dt>
                <dd>{settings.whatsapp}</dd>
              </div>
            )}
            {settings.email && (
              <div>
                <dt>Email</dt>
                <dd><a href={`mailto:${settings.email}`}>{settings.email}</a></dd>
              </div>
            )}
            {settings.address && (
              <div>
                <dt>Address</dt>
                <dd>{settings.address}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </article>
  );
}

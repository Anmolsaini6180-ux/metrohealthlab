import { Link } from "react-router-dom";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { useAsync } from "@/hooks/useAsync";
import { getAssignedMedia } from "@/services/mediaService";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema } from "@/utils/seoSchema";

export default function ContactPage() {
  const { settings } = useBrandingSettings();
  const hasAnyContact = !!(settings?.phone || settings?.email || settings?.whatsapp || settings?.address);
  // Admin -> Branding settings -> "Contact Us — image".
  const image = useAsync(() => getAssignedMedia("site_sections", "contact_image"), []);

  return (
    <article className="mh-static-page">
      <Seo
        title="Contact Us"
        description="Get in touch with Metro Health Lab for booking help, general queries, or support."
        path="/contact"
        jsonLd={buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])}
      />
      {image.data && (
        <img className="mh-static-page__hero" src={image.data.secureUrl} alt={image.data.altText ?? ""} />
      )}

      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>Contact us</h1>
      <p className="text-soft">
        For booking help, use the <Link to="/support">in-app Support page</Link> once signed in — it creates a
        tracked ticket our team responds to. For anything else, reach us at the details below.
      </p>

      {hasAnyContact ? (
        <dl className="mh-static-page__dl" style={{ marginTop: "var(--space-md)" }}>
          {settings?.phone && (
            <div>
              <dt>Phone</dt>
              <dd><a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>{settings.phone}</a></dd>
            </div>
          )}
          {settings?.whatsapp && (
            <div>
              <dt>WhatsApp</dt>
              <dd>{settings.whatsapp}</dd>
            </div>
          )}
          {settings?.email && (
            <div>
              <dt>Email</dt>
              <dd><a href={`mailto:${settings.email}`}>{settings.email}</a></dd>
            </div>
          )}
          {settings?.address && (
            <div>
              <dt>Address</dt>
              <dd>{settings.address}</dd>
            </div>
          )}
        </dl>
      ) : (
        // Genuinely no contact details configured yet — say so rather
        // than showing a fake email/phone. An admin sets these in
        // Admin -> Branding settings and they appear here immediately.
        <p className="text-soft" style={{ marginTop: "var(--space-md)" }}>
          Contact details haven't been added yet — please use the in-app Support page above.
        </p>
      )}
    </article>
  );
}

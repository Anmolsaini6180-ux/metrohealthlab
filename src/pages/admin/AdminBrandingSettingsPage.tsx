import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getBrandingSettings, updateBrandingSettings } from "@/services/settingsService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import MediaUploader from "@/components/admin/MediaUploader";
import ImagePicker from "@/components/admin/ImagePicker";
import { toUserMessage } from "@/utils/errors";

export default function AdminBrandingSettingsPage() {
  const { user } = useAuth();
  const settings = useAsync(getBrandingSettings, []);

  const [form, setForm] = useState({
    businessName: "",
    tagline: "",
    logoUrl: "",
    faviconUrl: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    city: "",
    aboutText: "",
    facebook: "",
    instagram: "",
    twitter: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setForm({
      businessName: settings.data.businessName ?? "",
      tagline: settings.data.tagline ?? "",
      logoUrl: settings.data.logoUrl ?? "",
      faviconUrl: settings.data.faviconUrl ?? "",
      phone: settings.data.phone ?? "",
      whatsapp: settings.data.whatsapp ?? "",
      email: settings.data.email ?? "",
      address: settings.data.address ?? "",
      city: settings.data.city ?? "",
      aboutText: settings.data.aboutText ?? "",
      facebook: settings.data.socialLinks?.facebook ?? "",
      instagram: settings.data.socialLinks?.instagram ?? "",
      twitter: settings.data.socialLinks?.twitter ?? "",
    });
  }, [settings.data]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await updateBrandingSettings(user.uid, {
        businessName: form.businessName,
        // Blank means "clear this field" — the service turns that into
        // a deleteField() rather than an undefined the SDK rejects.
        tagline: form.tagline,
        logoUrl: form.logoUrl,
        faviconUrl: form.faviconUrl,
        phone: form.phone,
        whatsapp: form.whatsapp,
        email: form.email,
        address: form.address,
        city: form.city,
        aboutText: form.aboutText,
        socialLinks: {
          facebook: form.facebook,
          instagram: form.instagram,
          twitter: form.twitter,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (settings.loading) return <LoadingState label="Loading settings..." rows={3} />;
  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.retry} />;

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: 4 }}>Branding settings</h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        The entire customer site (header, footer, login/signup, favicon) reads this live via one
        shared realtime listener — changes appear immediately, no redeploy. Upload the logo and
        favicon directly below; they go straight to Cloudinary. Leaving the logo empty keeps the
        original launch logo as the fallback.
      </p>

      <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", maxWidth: 480 }}>
        <input placeholder="Business name" required value={form.businessName} onChange={(e) => update("businessName", e.target.value)} />
        <input placeholder="Tagline" value={form.tagline} onChange={(e) => update("tagline", e.target.value)} />
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="branding-about" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
            About Us page content
          </label>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Shown on the public About Us page. Leave empty to show a short default description
            instead — never invent your company's history for you.
          </p>
          <textarea
            id="branding-about"
            placeholder="Write a few paragraphs about your lab, your labs network, or your story..."
            rows={5}
            value={form.aboutText}
            onChange={(e) => update("aboutText", e.target.value)}
          />
        </div>

        {/* Site-section images save themselves immediately (they assign
            an already-uploaded/newly-uploaded asset via mediaService's
            assignMedia, independent of this form's own Save button) —
            not part of the businessName/tagline/... submit cycle below. */}
        <ImagePicker
          label="About Us — hero image"
          category="site_sections"
          relatedId="about_hero"
          hint="Shown at the top of the public About Us page."
        />
        <ImagePicker
          label="Contact Us — image"
          category="site_sections"
          relatedId="contact_image"
          hint="Shown on the public Contact Us page."
        />

        <MediaUploader
          label="Logo"
          category="branding"
          relatedId="logo"
          value={form.logoUrl}
          hint="Shown in the header, footer and on the login/signup pages."
          onChange={(url) => update("logoUrl", url)}
          onClear={() => update("logoUrl", "")}
        />
        <MediaUploader
          label="Favicon"
          category="branding"
          relatedId="favicon"
          value={form.faviconUrl}
          hint="Square image, ideally 512×512."
          onChange={(url) => update("faviconUrl", url)}
          onClear={() => update("faviconUrl", "")}
        />
        <input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        <input placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => update("email", e.target.value)} />
        <textarea placeholder="Address" rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} />
        {/* Labelled rather than placeholder-only: the rest of this form
            identifies each box by placeholder, which disappears the
            moment a value is typed. That is tolerable for "Phone" or
            "Email", but this field needs to say where the value shows
            up. Uses the same label/hint styling MediaUploader already
            renders above, so nothing new is introduced. */}
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="branding-city" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
            Service area shown in the app header
          </label>
          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Appears next to the logo on mobile. Leave empty to hide it.
          </p>
          <input
            id="branding-city"
            placeholder="Ghaziabad, UP"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
          />
        </div>
        <input placeholder="Facebook URL" value={form.facebook} onChange={(e) => update("facebook", e.target.value)} />
        <input placeholder="Instagram URL" value={form.instagram} onChange={(e) => update("instagram", e.target.value)} />
        <input placeholder="Twitter/X URL" value={form.twitter} onChange={(e) => update("twitter", e.target.value)} />
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
        {saved && <p style={{ color: "var(--color-success)", fontSize: "var(--text-sm)" }}>Saved.</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Save settings"}</button>
      </form>
    </div>
  );
}

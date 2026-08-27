import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getBrandingSettings, updateBrandingSettings } from "@/services/settingsService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import MediaUploader from "@/components/admin/MediaUploader";
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
        tagline: form.tagline || undefined,
        logoUrl: form.logoUrl || undefined,
        faviconUrl: form.faviconUrl || undefined,
        phone: form.phone || undefined,
        whatsapp: form.whatsapp || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        socialLinks: {
          facebook: form.facebook || undefined,
          instagram: form.instagram || undefined,
          twitter: form.twitter || undefined,
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

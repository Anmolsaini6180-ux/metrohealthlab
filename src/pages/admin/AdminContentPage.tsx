import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getAllSiteContent, updateSiteContent } from "@/services/siteContentService";
import { BANNER_CONTENT_KEYS, SITE_CONTENT_LABELS, type SiteContentBlock, type SiteContentKey } from "@/types/siteContent";
import type { SiteSectionSlot } from "@/types/media";
import ImagePicker from "@/components/admin/ImagePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

// Real Supabase persistence (site_content table) — every block here is
// public, published content the moment it's saved, read by the exact
// pages named next to it. Nothing here is a mock/local-only editor.
const SECTIONS: { title: string; keys: SiteContentKey[] }[] = [
  { title: "Homepage", keys: ["homepage_final_cta"] },
  { title: "Legal & Policies", keys: ["terms", "privacy", "refund_policy"] },
  { title: "Booking", keys: ["booking_instructions", "sample_collection_info"] },
];

// Every current banner-type key happens to share its name with the
// site_sections slot that holds its background image — kept as an
// explicit map rather than assumed, so a future banner key that DOESN'T
// want an image (or names its slot differently) doesn't silently break.
function bannerImageSlot(key: SiteContentKey): SiteSectionSlot | null {
  return key === "homepage_final_cta" ? "homepage_final_cta" : null;
}

function isBannerKey(key: SiteContentKey): boolean {
  return (BANNER_CONTENT_KEYS as readonly string[]).includes(key);
}

export default function AdminContentPage() {
  const { user } = useAuth();
  const blocks = useAsync(getAllSiteContent, []);
  const [editingKey, setEditingKey] = useState<SiteContentKey | null>(null);

  const byKey = new Map((blocks.data ?? []).map((b) => [b.key, b]));

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: 4 }}>Website Content</h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        Edits here are published immediately — every page listed below reads this content live from Supabase.
      </p>

      {blocks.loading && <LoadingState rows={4} />}
      {blocks.error && <ErrorState message={blocks.error} onRetry={blocks.retry} />}

      {blocks.data && (
        <div style={{ display: "grid", gap: "var(--space-lg)" }}>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>{section.title}</h2>
              <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                {section.keys.map((key) => {
                  const block = byKey.get(key);
                  const banner = isBannerKey(key);
                  const hasContent = banner ? !!block?.title?.trim() : !!block?.body?.trim();
                  return (
                    <div key={key} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <p style={{ fontWeight: 600 }}>{SITE_CONTENT_LABELS[key]}</p>
                          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                            {!hasContent
                              ? "Not written yet — page shows a placeholder message"
                              : block && !block.active
                                ? "Hidden (saved, but switched off)"
                                : "Published"}
                          </p>
                        </div>
                        <button className="btn btn-outline" onClick={() => setEditingKey(editingKey === key ? null : key)}>
                          {editingKey === key ? "Close" : "Edit"}
                        </button>
                      </div>
                      {editingKey === key && (
                        <ContentEditForm
                          actorUid={user?.uid ?? ""}
                          contentKey={key}
                          banner={banner}
                          existing={block}
                          onDone={() => {
                            setEditingKey(null);
                            blocks.retry();
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentEditForm({
  actorUid,
  contentKey,
  banner,
  existing,
  onDone,
}: {
  actorUid: string;
  contentKey: SiteContentKey;
  banner: boolean;
  existing?: SiteContentBlock;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(existing?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(existing?.ctaUrl ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageSlot = banner ? bannerImageSlot(contentKey) : null;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await updateSiteContent(
        actorUid,
        contentKey,
        banner ? { title, subtitle, body, ctaLabel, ctaUrl, active } : { title, body }
      );
      showToast("Content saved.");
      onDone();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-sm)", marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: "1px solid var(--color-line)" }}>
      {banner && imageSlot && (
        <ImagePicker
          label="Background image"
          category="site_sections"
          relatedId={imageSlot}
          hint="Fills the entire banner as its background — same picker as every other homepage image section."
        />
      )}

      {banner && (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Eyebrow (small label above the heading)</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Metro Health Lab" />
        </label>
      )}

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{banner ? "Heading" : "Page title"}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{banner ? "Description (optional)" : "Content"}</span>
        <textarea
          rows={banner ? 3 : 12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={banner ? "A short supporting line under the heading." : "Leave a blank line between paragraphs."}
          style={{ fontFamily: "inherit", lineHeight: 1.5 }}
        />
        {!banner && (
          <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Plain text — leave a blank line between paragraphs. No formatting codes needed.
          </span>
        )}
      </label>

      {banner && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Button text</span>
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="e.g. Book Now" />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Button link</span>
            <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="e.g. /tests or /packages" />
          </label>
        </div>
      )}

      {banner && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Show this banner on the homepage
        </label>
      )}

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="button" disabled={busy} onClick={handleSave} style={{ justifySelf: "start" }}>
        {busy ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

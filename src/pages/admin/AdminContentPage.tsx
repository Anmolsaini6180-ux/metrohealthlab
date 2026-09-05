import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { getAllSiteContent, updateSiteContent } from "@/services/siteContentService";
import { SITE_CONTENT_LABELS, type SiteContentBlock, type SiteContentKey } from "@/types/siteContent";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import { toUserMessage } from "@/utils/errors";
import { useToast } from "@/hooks/useToast";

// Real Supabase persistence (site_content table) — every block here is
// public, published content the moment it's saved, read by the exact
// pages named next to it. Nothing here is a mock/local-only editor.
const SECTIONS: { title: string; keys: SiteContentKey[] }[] = [
  { title: "Legal & Policies", keys: ["terms", "privacy", "refund_policy"] },
  { title: "Booking", keys: ["booking_instructions", "sample_collection_info"] },
];

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
                  const hasContent = !!block?.body?.trim();
                  return (
                    <div key={key} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <p style={{ fontWeight: 600 }}>{SITE_CONTENT_LABELS[key]}</p>
                          <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                            {hasContent ? "Published" : "Not written yet — page shows a placeholder message"}
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
  existing,
  onDone,
}: {
  actorUid: string;
  contentKey: SiteContentKey;
  existing?: SiteContentBlock;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await updateSiteContent(actorUid, contentKey, { title, body });
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
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Page title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Content</span>
        <textarea
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a blank line between paragraphs."
          style={{ fontFamily: "inherit", lineHeight: 1.5 }}
        />
        <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
          Plain text — leave a blank line between paragraphs. No formatting codes needed.
        </span>
      </label>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="button" disabled={busy} onClick={handleSave} style={{ justifySelf: "start" }}>
        {busy ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

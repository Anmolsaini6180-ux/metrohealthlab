// Supabase-backed. RLS: site_content_public_read allows anyone (this
// is published, public-facing content by definition — Terms, Privacy,
// etc.), site_content_staff_write restricts writes to can_manage_catalog().
import { getSupabaseClient } from "@/supabase/client";
import type { SiteContentBlock, SiteContentKey } from "@/types/siteContent";

function rowToSiteContent(r: Record<string, unknown>): SiteContentBlock {
  return {
    key: r.key as SiteContentKey,
    title: (r.title as string) ?? undefined,
    subtitle: (r.subtitle as string) ?? undefined,
    body: (r.body as string) ?? undefined,
    imageUrl: (r.image_url as string) ?? undefined,
    ctaLabel: (r.cta_label as string) ?? undefined,
    ctaUrl: (r.cta_url as string) ?? undefined,
    active: (r.active as boolean | null) ?? true,
    updatedAt: r.updated_at,
    updatedBy: (r.updated_by as string) ?? undefined,
  };
}

/** One named content block, or null if genuinely empty/never written — never a fake default. */
export async function getSiteContent(key: SiteContentKey): Promise<SiteContentBlock | null> {
  const { data, error } = await getSupabaseClient().from("site_content").select("*").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? rowToSiteContent(data) : null;
}

export async function getAllSiteContent(): Promise<SiteContentBlock[]> {
  const { data, error } = await getSupabaseClient().from("site_content").select("*").order("key", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToSiteContent);
}

export async function updateSiteContent(
  actorUid: string,
  key: SiteContentKey,
  patch: Partial<Pick<SiteContentBlock, "title" | "subtitle" | "body" | "imageUrl" | "ctaLabel" | "ctaUrl" | "active">>
): Promise<void> {
  const update: Record<string, unknown> = { updated_by: actorUid, updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title || null;
  if (patch.subtitle !== undefined) update.subtitle = patch.subtitle || null;
  if (patch.body !== undefined) update.body = patch.body || null;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl || null;
  if (patch.ctaLabel !== undefined) update.cta_label = patch.ctaLabel || null;
  if (patch.ctaUrl !== undefined) update.cta_url = patch.ctaUrl || null;
  if (patch.active !== undefined) update.active = patch.active;

  const { error } = await getSupabaseClient().from("site_content").update(update).eq("key", key);
  if (error) throw error;
}

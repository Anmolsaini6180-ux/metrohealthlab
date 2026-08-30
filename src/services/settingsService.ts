// Supabase-backed. settings.data is a single jsonb column holding the
// whole branding document — same shape Firestore's settings/branding
// document always had, so BrandingSettings itself is unchanged.
import { getSupabaseClient } from "@/supabase/client";
import { optionalText } from "@/utils/firestoreData";
import type { BrandingSettings } from "@/types/settings";

const BRANDING_ID = "branding";
type Unsubscribe = () => void;

// Public read (RLS: settings is world-readable, same as Firestore's
// `allow read: if true`) — the one place both the customer site and
// the admin panel read branding from, so they can never disagree.
export async function getBrandingSettings(): Promise<BrandingSettings | null> {
  const { data, error } = await getSupabaseClient().from("settings").select("data").eq("id", BRANDING_ID).maybeSingle();
  if (error) throw error;
  return (data?.data as BrandingSettings) ?? null;
}

// Realtime — used by the customer Footer so a branding change appears
// without a page refresh.
export function subscribeToBrandingSettings(
  callback: (settings: BrandingSettings | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const refetch = () => getBrandingSettings().then(callback).catch((err) => onError?.(err));
  refetch();
  const channel = getSupabaseClient()
    .channel("settings-branding")
    .on("postgres_changes", { event: "*", schema: "public", table: "settings", filter: `id=eq.${BRANDING_ID}` }, refetch)
    .subscribe();
  return () => getSupabaseClient().removeChannel(channel);
}

const OPTIONAL_BRANDING_FIELDS = ["tagline", "logoUrl", "faviconUrl", "phone", "whatsapp", "email", "address", "city"] as const;
const OPTIONAL_SOCIAL_FIELDS = ["facebook", "instagram", "twitter", "youtube", "linkedin"] as const;

// What the branding form hands over. Same three-way convention as
// before: absent -> leave stored value alone, "" / null -> remove the
// key, "value" -> set it. With a jsonb column there is no deleteField()
// sentinel; a cleared key is achieved by omitting it from the merged
// object written back, which is exactly what the loop below does.
export interface BrandingSettingsInput
  extends Partial<Record<(typeof OPTIONAL_BRANDING_FIELDS)[number], string | null>> {
  businessName?: string;
  socialLinks?: Partial<Record<(typeof OPTIONAL_SOCIAL_FIELDS)[number], string | null>>;
}

// Admin write — gated by RLS (can_manage_catalog() + updated_by must
// match the caller), same boundary as the rest of the catalogue.
export async function updateBrandingSettings(actorUid: string, input: BrandingSettingsInput): Promise<void> {
  const client = getSupabaseClient();
  const { data: existing, error: readError } = await client.from("settings").select("data").eq("id", BRANDING_ID).maybeSingle();
  if (readError) throw readError;

  const current = (existing?.data as Record<string, unknown>) ?? {};
  const next: Record<string, unknown> = { ...current };

  if (input.businessName !== undefined) next.businessName = input.businessName.trim();

  for (const key of OPTIONAL_BRANDING_FIELDS) {
    const value = input[key];
    if (value === undefined) continue;
    const text = optionalText(value);
    if (text === undefined) delete next[key];
    else next[key] = text;
  }

  if (input.socialLinks) {
    const social: Record<string, unknown> = { ...((current.socialLinks as Record<string, unknown>) ?? {}) };
    for (const key of OPTIONAL_SOCIAL_FIELDS) {
      const value = input.socialLinks[key];
      if (value === undefined) continue;
      const text = optionalText(value);
      if (text === undefined) delete social[key];
      else social[key] = text;
    }
    if (Object.keys(social).length > 0) next.socialLinks = social;
    else delete next.socialLinks;
  }

  const { error } = await client
    .from("settings")
    .upsert({ id: BRANDING_ID, data: next, updated_by: actorUid }, { onConflict: "id" });
  if (error) throw error;
}

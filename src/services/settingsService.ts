import { deleteField, doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { optionalText, stripUndefined } from "@/utils/firestoreData";
import type { BrandingSettings } from "@/types/settings";

const SETTINGS = "settings";
const BRANDING_DOC_ID = "branding";

// Public read (per firestore.rules: settings/{id} allow read: if true)
// — this is the one place both the customer site and the admin panel
// read branding from, so they can never disagree.
export async function getBrandingSettings(): Promise<BrandingSettings | null> {
  const snap = await getDoc(doc(getDb(), SETTINGS, BRANDING_DOC_ID));
  if (!snap.exists()) return null;
  return snap.data() as BrandingSettings;
}

// Realtime — used by the customer Footer so a branding change appears
// without a page refresh, matching the "no redeploy" requirement.
export function subscribeToBrandingSettings(
  callback: (settings: BrandingSettings | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), SETTINGS, BRANDING_DOC_ID),
    (snap) => callback(snap.exists() ? (snap.data() as BrandingSettings) : null),
    (err) => onError?.(err)
  );
}

const OPTIONAL_BRANDING_FIELDS = [
  "tagline",
  "logoUrl",
  "faviconUrl",
  "phone",
  "whatsapp",
  "email",
  "address",
  "city",
] as const;

const OPTIONAL_SOCIAL_FIELDS = ["facebook", "instagram", "twitter", "youtube", "linkedin"] as const;

// What the branding form hands over. Optional fields follow the same
// three-way convention as the catalog service:
//   absent    -> leave the stored value alone
//   "" / null -> the admin cleared it; remove the field from the doc
//   "value"   -> set it
export interface BrandingSettingsInput
  extends Partial<Record<(typeof OPTIONAL_BRANDING_FIELDS)[number], string | null>> {
  businessName?: string;
  socialLinks?: Partial<Record<(typeof OPTIONAL_SOCIAL_FIELDS)[number], string | null>>;
}

// Admin write — gated by firestore.rules (canManageCatalog() +
// updatedBy must match the caller), same pattern as the rest of the
// catalog. Uses set+merge against the fixed doc id rather than
// addDoc/updateDoc since there's exactly one branding document, which
// may not exist yet on a fresh project.
//
// merge:true is precisely why a cleared field needs deleteField(): a
// key that is simply left out keeps whatever is already stored, so
// dropping the blanks would turn "remove my tagline" into a no-op.
// Writing `undefined` is not an option either — setDoc() rejects it,
// which is what used to make this whole screen fail to save.
export async function updateBrandingSettings(actorUid: string, input: BrandingSettingsInput): Promise<void> {
  const patch: Record<string, unknown> = { updatedBy: actorUid, updatedAt: serverTimestamp() };

  if (input.businessName !== undefined) patch.businessName = input.businessName.trim();

  for (const key of OPTIONAL_BRANDING_FIELDS) {
    const value = input[key];
    if (value === undefined) continue;
    patch[key] = optionalText(value) ?? deleteField();
  }

  if (input.socialLinks) {
    // deleteField() inside a nested map is honoured by set+merge, so a
    // cleared handle disappears instead of lingering as an empty link.
    const social: Record<string, unknown> = {};
    for (const key of OPTIONAL_SOCIAL_FIELDS) {
      const value = input.socialLinks[key];
      if (value === undefined) continue;
      social[key] = optionalText(value) ?? deleteField();
    }
    if (Object.keys(social).length > 0) patch.socialLinks = social;
  }

  await setDoc(doc(getDb(), SETTINGS, BRANDING_DOC_ID), stripUndefined(patch), { merge: true });
}

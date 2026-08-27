import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
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

// Admin write — gated by firestore.rules (canManageCatalog() +
// updatedBy must match the caller), same pattern as the rest of the
// catalog. Uses set+merge against the fixed doc id rather than
// addDoc/updateDoc since there's exactly one branding document, which
// may not exist yet on a fresh project.
export async function updateBrandingSettings(actorUid: string, data: Partial<BrandingSettings>): Promise<void> {
  await setDoc(
    doc(getDb(), SETTINGS, BRANDING_DOC_ID),
    { ...data, updatedBy: actorUid, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

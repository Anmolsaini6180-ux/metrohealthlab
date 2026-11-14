// Matches a lead's admin-typed phone number (any format: with/without
// +91, spaces, dashes) against a registered customer's profile phone.
// Comparing only the last 10 digits is the standard robust approach
// for Indian mobile numbers, and is deliberately loose rather than
// requiring an exact string match — a lead saved as "99900 01111" and
// a profile saved as "+91-9990001111" are the same real number.

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export interface PhoneOwner {
  id: string;
  phone: string | null;
}

/** Normalized-phone -> profile id, built once and reused for every lead being matched. */
export function buildPhoneMatchMap(profiles: PhoneOwner[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of profiles) {
    const key = normalizePhone(p.phone);
    // First match wins — two profiles sharing a phone number would be
    // a real data anomaly, not something to silently overwrite/pick
    // the "latest" of.
    if (key && !map.has(key)) map.set(key, p.id);
  }
  return map;
}

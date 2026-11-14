// Indian mobile numbers: 10 digits, first digit 6-9 (the actual
// numbering-plan rule — an 11-digit or 0-prefixed or landline-shaped
// input is rejected rather than silently truncated/accepted).
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Strips spaces/dashes/+91/91/leading 0, leaving bare digits for validation/storage. */
export function normalizeIndianMobile(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function isValidIndianMobile(raw: string): boolean {
  return INDIAN_MOBILE.test(normalizeIndianMobile(raw));
}

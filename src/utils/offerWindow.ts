import type { Offer } from "@/types/content";

// Whether an offer should be visible to a customer right now.
//
// Firestore does the `active == true` half of this; the validity window
// cannot go into the same query because a range filter on startAt AND a
// range filter on endAt are two different fields, which Firestore will
// not serve together. The offer set is small and already capped, so the
// window is applied here instead — as a pure function, so "expired
// offers disappear" is a testable rule rather than a hope.
//
// Dates are stored as plain "YYYY-MM-DD" strings by the admin form.
// They are treated as inclusive calendar days in the viewer's own
// timezone: an offer ending today is still live for the whole of today.

function startOfDay(value: string): number | null {
  const parsed = new Date(`${value}T00:00:00`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function endOfDay(value: string): number | null {
  const parsed = new Date(`${value}T23:59:59.999`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

export function isOfferLive(offer: Offer, now: Date = new Date()): boolean {
  if (!offer.active) return false;

  const at = now.getTime();

  // An unparseable or absent bound is treated as "no bound" rather than
  // as an expiry — a typo in one date should not silently retire an
  // offer the admin believes is running.
  if (offer.startAt) {
    const from = startOfDay(offer.startAt);
    if (from !== null && at < from) return false;
  }

  if (offer.endAt) {
    const until = endOfDay(offer.endAt);
    if (until !== null && at > until) return false;
  }

  return true;
}

/** Live offers only, in the order the admin arranged them. */
export function liveOffers(offers: Offer[], now: Date = new Date()): Offer[] {
  return offers
    .filter((offer) => isOfferLive(offer, now))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

import { describe, expect, it } from "vitest";
import { isOfferLive, liveOffers } from "@/utils/offerWindow";
import type { Offer } from "@/types/content";

function offer(partial: Partial<Offer>): Offer {
  return { id: "o1", title: "Free home collection", active: true, ...partial };
}

const NOW = new Date("2026-06-15T12:00:00");

describe("isOfferLive", () => {
  it("shows an active offer with no validity window", () => {
    expect(isOfferLive(offer({}), NOW)).toBe(true);
  });

  it("hides an offer the admin disabled", () => {
    expect(isOfferLive(offer({ active: false }), NOW)).toBe(false);
  });

  it("hides an offer that has not started yet", () => {
    expect(isOfferLive(offer({ startAt: "2026-06-16" }), NOW)).toBe(false);
  });

  it("shows an offer on its first day", () => {
    expect(isOfferLive(offer({ startAt: "2026-06-15" }), NOW)).toBe(true);
  });

  // Inclusive end date: an offer ending today runs until midnight, not
  // until the moment the page happens to load.
  it("shows an offer on its last day", () => {
    expect(isOfferLive(offer({ endAt: "2026-06-15" }), NOW)).toBe(true);
    expect(isOfferLive(offer({ endAt: "2026-06-15" }), new Date("2026-06-15T23:59:00"))).toBe(true);
  });

  it("hides an offer that has expired", () => {
    expect(isOfferLive(offer({ endAt: "2026-06-14" }), NOW)).toBe(false);
  });

  it("shows an offer inside both bounds and hides it outside", () => {
    const o = offer({ startAt: "2026-06-01", endAt: "2026-06-30" });
    expect(isOfferLive(o, NOW)).toBe(true);
    expect(isOfferLive(o, new Date("2026-05-31T23:00:00"))).toBe(false);
    expect(isOfferLive(o, new Date("2026-07-01T00:01:00"))).toBe(false);
  });

  // A mistyped date must not quietly retire a running offer.
  it("ignores an unparseable bound rather than treating it as expiry", () => {
    expect(isOfferLive(offer({ endAt: "not-a-date" }), NOW)).toBe(true);
    expect(isOfferLive(offer({ startAt: "" }), NOW)).toBe(true);
  });

  it("disabled beats an otherwise valid window", () => {
    expect(isOfferLive(offer({ active: false, startAt: "2026-06-01", endAt: "2026-06-30" }), NOW)).toBe(false);
  });
});

describe("liveOffers", () => {
  it("keeps only live offers and orders them by displayOrder", () => {
    const result = liveOffers(
      [
        offer({ id: "c", title: "C", displayOrder: 2 }),
        offer({ id: "expired", title: "Expired", endAt: "2026-01-01" }),
        offer({ id: "a", title: "A", displayOrder: 0 }),
        offer({ id: "off", title: "Disabled", active: false }),
        offer({ id: "b", title: "B", displayOrder: 1 }),
      ],
      NOW
    );

    expect(result.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("treats a missing displayOrder as first rather than dropping the offer", () => {
    const result = liveOffers([offer({ id: "x", displayOrder: 5 }), offer({ id: "y" })], NOW);
    expect(result.map((o) => o.id)).toEqual(["y", "x"]);
  });

  it("returns nothing when every offer is disabled or expired", () => {
    expect(liveOffers([offer({ active: false }), offer({ id: "e", endAt: "2020-01-01" })], NOW)).toEqual([]);
  });
});

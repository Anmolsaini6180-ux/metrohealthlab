import { describe, expect, it } from "vitest";
import { isBannerLive } from "@/services/contentService";
import type { Banner } from "@/types/content";

// Real, confirmed root cause of a live production bug: getBanners()
// used to filter only on `active`, never on start_at/end_at — so an
// admin-scheduled banner outside its own window showed anyway (or,
// worse, hid nothing at all, which is how stale seed banners with no
// real image ended up ahead of a real one in the carousel). This
// mirrors offerWindow.test.ts's own coverage shape for the identical
// rule already proven correct there.
function banner(partial: Partial<Banner>): Banner {
  return { id: "b1", title: "Test banner", active: true, ...partial };
}

const NOW = new Date("2026-09-06T12:00:00");

describe("isBannerLive", () => {
  it("shows a banner with no validity window", () => {
    expect(isBannerLive(banner({}), NOW)).toBe(true);
  });

  it("hides a banner that has not started yet", () => {
    expect(isBannerLive(banner({ startAt: "2026-09-07" }), NOW)).toBe(false);
  });

  it("shows a banner on its first day", () => {
    expect(isBannerLive(banner({ startAt: "2026-09-06" }), NOW)).toBe(true);
  });

  // Inclusive end date: a banner ending today runs until midnight, not
  // until the moment the page happens to load.
  it("shows a banner on its last day", () => {
    expect(isBannerLive(banner({ endAt: "2026-09-06" }), NOW)).toBe(true);
    expect(isBannerLive(banner({ endAt: "2026-09-06" }), new Date("2026-09-06T23:59:00"))).toBe(true);
  });

  it("hides a banner that has expired", () => {
    expect(isBannerLive(banner({ endAt: "2026-09-05" }), NOW)).toBe(false);
  });

  it("shows a banner inside both bounds and hides it outside", () => {
    const b = banner({ startAt: "2026-09-05", endAt: "2026-09-15" });
    expect(isBannerLive(b, NOW)).toBe(true);
    expect(isBannerLive(b, new Date("2026-09-04T23:00:00"))).toBe(false);
    expect(isBannerLive(b, new Date("2026-09-16T00:01:00"))).toBe(false);
  });

  // A mistyped date must not quietly hide a banner the admin believes
  // is running — same defensive rule as offerWindow.ts's own.
  it("ignores an unparseable bound rather than treating it as expiry", () => {
    expect(isBannerLive(banner({ endAt: "not-a-date" }), NOW)).toBe(true);
    expect(isBannerLive(banner({ startAt: "" }), NOW)).toBe(true);
  });

  // The exact live-data shape that motivated this fix: a real banner
  // ("My prime diagnostic lab") with start_at 2026-09-05 and end_at
  // 2026-09-15 — must be live today.
  it("matches the real production banner window this fix was written for", () => {
    expect(isBannerLive(banner({ startAt: "2026-09-05", endAt: "2026-09-15" }), NOW)).toBe(true);
  });
});

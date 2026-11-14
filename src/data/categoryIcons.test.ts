import { describe, expect, it } from "vitest";
import {
  CATEGORY_ICONS,
  CATEGORY_ICON_GROUPS,
  FALLBACK_CATEGORY_ICON,
  isKnownCategoryIcon,
  normalizeIconName,
  searchCategoryIcons,
} from "@/data/categoryIcons";

describe("the category icon catalog", () => {
  it("offers a substantial, medical-first set", () => {
    expect(CATEGORY_ICONS.length).toBeGreaterThanOrEqual(100);
  });

  it("has no duplicate ligature names", () => {
    const names = CATEGORY_ICONS.map((icon) => icon.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only contains names that survive normalization", () => {
    for (const icon of CATEGORY_ICONS) {
      expect(normalizeIconName(icon.name), icon.name).toBe(icon.name);
    }
  });

  it("covers every declared group", () => {
    for (const group of CATEGORY_ICON_GROUPS) {
      expect(CATEGORY_ICONS.some((icon) => icon.group === group), group).toBe(true);
    }
  });

  it("includes the fallback icon, so the fallback is always renderable", () => {
    expect(isKnownCategoryIcon(FALLBACK_CATEGORY_ICON)).toBe(true);
  });
});

describe("normalizeIconName", () => {
  it("accepts a plain ligature name", () => {
    expect(normalizeIconName("bloodtype")).toBe("bloodtype");
    expect(normalizeIconName("monitor_heart")).toBe("monitor_heart");
  });

  it("tidies up what a human might type or paste", () => {
    expect(normalizeIconName("  Bloodtype  ")).toBe("bloodtype");
    expect(normalizeIconName("monitor heart")).toBe("monitor_heart");
    expect(normalizeIconName("monitor-heart")).toBe("monitor_heart");
  });

  it("rejects the values a broken legacy document can hold", () => {
    expect(normalizeIconName(undefined)).toBeUndefined();
    expect(normalizeIconName(null)).toBeUndefined();
    expect(normalizeIconName("")).toBeUndefined();
    expect(normalizeIconName("   ")).toBeUndefined();
    expect(normalizeIconName("undefined")).toBeUndefined();
    expect(normalizeIconName("null")).toBeUndefined();
    expect(normalizeIconName(42)).toBeUndefined();
    expect(normalizeIconName({ name: "bloodtype" })).toBeUndefined();
  });

  it("rejects values that are not ligatures at all", () => {
    expect(normalizeIconName("🩸")).toBeUndefined();
    expect(normalizeIconName("https://example.com/icon.svg")).toBeUndefined();
    expect(normalizeIconName("fa-tint")).toBe("fa_tint"); // shape-valid, simply not in the font
    expect(normalizeIconName("_leading")).toBeUndefined();
    expect(normalizeIconName("x".repeat(80))).toBeUndefined();
  });
});

describe("searchCategoryIcons", () => {
  it("returns the whole catalog for an empty query", () => {
    expect(searchCategoryIcons("").length).toBe(CATEGORY_ICONS.length);
    expect(searchCategoryIcons("   ").length).toBe(CATEGORY_ICONS.length);
  });

  it("matches on the ligature name", () => {
    expect(searchCategoryIcons("bloodtype").map((i) => i.name)).toContain("bloodtype");
  });

  it("matches on synonyms an admin is likely to type", () => {
    expect(searchCategoryIcons("heart").map((i) => i.name)).toContain("monitor_heart");
    expect(searchCategoryIcons("covid").map((i) => i.name)).toContain("coronavirus");
    expect(searchCategoryIcons("xray").map((i) => i.name)).toContain("document_scanner");
    expect(searchCategoryIcons("discount").map((i) => i.name)).toContain("local_offer");
  });

  it("treats an underscored name as separate words", () => {
    expect(searchCategoryIcons("monitor heart").map((i) => i.name)).toContain("monitor_heart");
  });

  it("narrows rather than widens with each extra term", () => {
    const broad = searchCategoryIcons("blood");
    const narrow = searchCategoryIcons("blood sample");
    expect(narrow.length).toBeLessThanOrEqual(broad.length);
  });

  it("is case-insensitive", () => {
    expect(searchCategoryIcons("BLOOD").length).toBe(searchCategoryIcons("blood").length);
  });

  it("returns nothing for a query that matches no icon", () => {
    expect(searchCategoryIcons("zzzzqqqq")).toEqual([]);
  });
});

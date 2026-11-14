import { beforeEach, describe, expect, it } from "vitest";
import { loadRecent, saveRecent } from "@/components/common/SearchAutocomplete";

// The vitest environment here is "node" (see vitest.config.ts), which
// has no real localStorage — a minimal in-memory shim is enough to
// exercise the actual persistence logic (both functions already
// tolerate a throwing/missing localStorage, so this only needs to
// cover the happy path a real browser gives them).
function installLocalStorageShim() {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStorageShim();
});

describe("loadRecent / saveRecent", () => {
  it("starts empty when nothing has been searched yet", () => {
    expect(loadRecent()).toEqual([]);
  });

  it("remembers a search term, most recent first", () => {
    saveRecent("CBC");
    saveRecent("Vitamin D");
    expect(loadRecent()).toEqual(["Vitamin D", "CBC"]);
  });

  it("moves a repeated term to the front instead of duplicating it", () => {
    saveRecent("CBC");
    saveRecent("Vitamin D");
    saveRecent("cbc"); // case-insensitive match against the earlier "CBC"
    expect(loadRecent()).toEqual(["cbc", "Vitamin D"]);
  });

  it("caps the list at 5 entries, dropping the oldest", () => {
    ["A", "B", "C", "D", "E", "F"].forEach((term) => saveRecent(term));
    expect(loadRecent()).toEqual(["F", "E", "D", "C", "B"]);
  });

  it("ignores a blank search term", () => {
    saveRecent("   ");
    expect(loadRecent()).toEqual([]);
  });

  it("never throws when localStorage is unavailable (private browsing)", () => {
    (globalThis as { localStorage?: Storage }).localStorage = undefined as unknown as Storage;
    expect(() => saveRecent("CBC")).not.toThrow();
    expect(loadRecent()).toEqual([]);
  });
});

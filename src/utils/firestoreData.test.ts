import { describe, expect, it } from "vitest";
import { optionalText, stripUndefined } from "@/utils/firestoreData";

// Stands in for a Firestore sentinel / Timestamp / DocumentReference:
// an object with a custom prototype that must survive by reference.
class FakeSentinel {
  constructor(readonly kind: string) {}
}

describe("stripUndefined", () => {
  it("removes undefined properties instead of forwarding them to Firestore", () => {
    const payload = stripUndefined({
      name: "Blood Tests",
      subtitle: "Up to 70% off",
      icon: undefined,
    });

    expect(payload).toEqual({ name: "Blood Tests", subtitle: "Up to 70% off" });
    expect("icon" in payload).toBe(false);
  });

  it("keeps null, empty strings, zero and false", () => {
    const payload = stripUndefined({ a: null, b: "", c: 0, d: false });
    expect(payload).toEqual({ a: null, b: "", c: 0, d: false });
  });

  it("does not mutate the input object", () => {
    const input = { name: "X", icon: undefined };
    const output = stripUndefined(input);
    expect("icon" in input).toBe(true);
    expect(output).not.toBe(input);
  });

  it("recurses into nested plain objects", () => {
    const payload = stripUndefined({
      social: { facebook: "fb", instagram: undefined },
      nested: { deep: { keep: 1, drop: undefined } },
    });
    expect(payload).toEqual({ social: { facebook: "fb" }, nested: { deep: { keep: 1 } } });
  });

  it("passes non-plain objects through by reference so sentinels survive", () => {
    const sentinel = new FakeSentinel("serverTimestamp");
    const date = new Date("2024-01-01T00:00:00.000Z");
    const payload = stripUndefined({ createdAt: sentinel, when: date, icon: undefined });

    expect(payload.createdAt).toBe(sentinel);
    expect(payload.when).toBe(date);
  });

  it("cleans objects inside arrays but never re-indexes them", () => {
    const payload = stripUndefined({
      faq: [{ question: "Q", answer: "A", note: undefined }],
      labIds: ["a", "b"],
    });

    expect(payload.faq).toEqual([{ question: "Q", answer: "A" }]);
    expect(payload.labIds).toEqual(["a", "b"]);
  });
});

describe("optionalText", () => {
  it("treats blank input as 'no value'", () => {
    expect(optionalText("")).toBeUndefined();
    expect(optionalText("   ")).toBeUndefined();
    expect(optionalText(null)).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
  });

  it("trims a real value", () => {
    expect(optionalText("  bloodtype  ")).toBe("bloodtype");
  });
});

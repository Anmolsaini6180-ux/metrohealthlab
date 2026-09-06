import { describe, expect, it } from "vitest";
import { buildPhoneMatchMap, normalizePhone } from "./phoneMatch";

describe("normalizePhone", () => {
  it("strips a +91 country code and any spaces/dashes down to the last 10 digits", () => {
    expect(normalizePhone("+91 99900 01111")).toBe("9990001111");
    expect(normalizePhone("+91-9990001111")).toBe("9990001111");
    expect(normalizePhone("09990001111")).toBe("9990001111");
  });

  it("returns null for null, empty, or too-short input rather than a misleading short string", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("buildPhoneMatchMap", () => {
  it("maps a normalized phone to the profile id, matching across differing formats", () => {
    const map = buildPhoneMatchMap([{ id: "u1", phone: "+91-9990001111" }]);
    expect(map.get("9990001111")).toBe("u1");
  });

  it("skips a profile with no phone on file rather than mapping a null key", () => {
    const map = buildPhoneMatchMap([{ id: "u1", phone: null }]);
    expect(map.size).toBe(0);
  });

  it("keeps the first profile when two somehow share the same phone, rather than overwriting silently", () => {
    const map = buildPhoneMatchMap([
      { id: "u1", phone: "9990001111" },
      { id: "u2", phone: "9990001111" },
    ]);
    expect(map.get("9990001111")).toBe("u1");
  });
});

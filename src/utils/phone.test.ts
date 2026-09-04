import { describe, expect, it } from "vitest";
import { isValidIndianMobile, normalizeIndianMobile } from "./phone";

describe("normalizeIndianMobile", () => {
  it("strips spaces and dashes", () => {
    expect(normalizeIndianMobile("98765 43210")).toBe("9876543210");
    expect(normalizeIndianMobile("98765-43210")).toBe("9876543210");
  });

  it("strips a +91 or 91 country code", () => {
    expect(normalizeIndianMobile("+919876543210")).toBe("9876543210");
    expect(normalizeIndianMobile("919876543210")).toBe("9876543210");
  });

  it("strips a leading trunk 0", () => {
    expect(normalizeIndianMobile("09876543210")).toBe("9876543210");
  });

  it("leaves a bare 10-digit number as-is", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("9876543210");
  });
});

describe("isValidIndianMobile", () => {
  it("accepts a real-shaped 10-digit mobile number starting 6-9", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("6000000000")).toBe(true);
    expect(isValidIndianMobile("+91 98765 43210")).toBe(true);
  });

  it("rejects a number starting 0-5 (not a real Indian mobile prefix)", () => {
    expect(isValidIndianMobile("5876543210")).toBe(false);
    expect(isValidIndianMobile("0123456789")).toBe(false);
  });

  it("rejects the wrong number of digits", () => {
    expect(isValidIndianMobile("987654321")).toBe(false); // 9 digits
    expect(isValidIndianMobile("98765432101")).toBe(false); // 11 digits, no recognizable prefix
  });

  it("rejects empty or non-numeric input", () => {
    expect(isValidIndianMobile("")).toBe(false);
    expect(isValidIndianMobile("not a phone")).toBe(false);
  });
});

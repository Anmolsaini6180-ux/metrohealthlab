import { describe, expect, it } from "vitest";
import { displayedTestCount } from "./packageDisplay";

describe("displayedTestCount", () => {
  it("uses the real linked-tests count when no override is set", () => {
    expect(displayedTestCount({ testIds: ["t1", "t2", "t3"], testCountOverride: null })).toBe(3);
    expect(displayedTestCount({ testIds: ["t1", "t2", "t3"], testCountOverride: undefined })).toBe(3);
  });

  it("uses the admin's override when one is set, even if it disagrees with the real linked-tests count", () => {
    expect(displayedTestCount({ testIds: ["t1"], testCountOverride: 70 })).toBe(70);
  });

  it("treats an explicit 0 override as a real override, not \"no override\"", () => {
    expect(displayedTestCount({ testIds: ["t1", "t2"], testCountOverride: 0 })).toBe(0);
  });

  it("falls back to 0 for a package with no linked tests and no override", () => {
    expect(displayedTestCount({ testIds: [], testCountOverride: null })).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { computeMargin } from "./margin";

describe("computeMargin", () => {
  it("matches the worked example from the spec: selling 1599, tp 900 -> margin 699", () => {
    const margin = computeMargin(1599, 900);
    expect(margin).not.toBeNull();
    expect(margin!.amount).toBe(699);
    expect(margin!.percent).toBeCloseTo((699 / 1599) * 100, 5);
  });

  it("returns null (not a fake 0% or 100%) when tp is null", () => {
    expect(computeMargin(1599, null)).toBeNull();
  });

  it("returns null when tp is undefined", () => {
    expect(computeMargin(1599, undefined)).toBeNull();
  });

  it("treats a real tp of 0 as a real 100% margin, distinct from tp being unset", () => {
    const margin = computeMargin(500, 0);
    expect(margin).not.toBeNull();
    expect(margin!.amount).toBe(500);
    expect(margin!.percent).toBe(100);
  });

  it("allows a negative margin — a real loss-leader is not a bug", () => {
    const margin = computeMargin(500, 700);
    expect(margin!.amount).toBe(-200);
    expect(margin!.percent).toBeCloseTo(-40, 5);
  });

  it("returns a null percent (not Infinity/NaN) when selling price is 0", () => {
    const margin = computeMargin(0, 50);
    expect(margin!.amount).toBe(-50);
    expect(margin!.percent).toBeNull();
  });
});

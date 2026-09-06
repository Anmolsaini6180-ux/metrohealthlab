import { describe, expect, it } from "vitest";
import { averageEdgeColor, rgbToCss } from "./useDominantEdgeColor";

// Builds a flat RGBA buffer for a size x size image, one solid colour
// per pixel unless overridden — lets a test paint just the corners/
// centre differently without hand-writing every byte.
function buildBuffer(size: number, base: [number, number, number], overrides: Record<string, [number, number, number]> = {}): number[] {
  const data: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = overrides[`${x},${y}`] ?? base;
      data.push(r, g, b, 255);
    }
  }
  return data;
}

describe("averageEdgeColor", () => {
  it("returns the flat colour when the whole image is one solid colour", () => {
    const data = buildBuffer(4, [100, 150, 200]);
    expect(averageEdgeColor(data, 4)).toEqual({ r: 100, g: 150, b: 200 });
  });

  it("ignores the centre pixel entirely, however different its colour is", () => {
    // A 3x3 buffer: white border, one bright-red centre pixel. If the
    // centre leaked into the average, red would visibly pull the
    // result away from pure white.
    const data = buildBuffer(3, [255, 255, 255], { "1,1": [255, 0, 0] });
    expect(averageEdgeColor(data, 3)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("averages a mix of differently-coloured edge pixels", () => {
    // 2x2: every pixel is an edge pixel (no interior at all), so this
    // is a plain average of all four corners.
    const data = buildBuffer(2, [0, 0, 0], {
      "0,0": [0, 0, 0],
      "1,0": [100, 0, 0],
      "0,1": [0, 100, 0],
      "1,1": [0, 0, 100],
    });
    expect(averageEdgeColor(data, 2)).toEqual({ r: 25, g: 25, b: 25 });
  });

  it("returns null for a zero-size buffer instead of dividing by zero", () => {
    expect(averageEdgeColor([], 0)).toBeNull();
  });
});

describe("rgbToCss", () => {
  it("formats as a valid rgb() CSS colour", () => {
    expect(rgbToCss({ r: 12, g: 34, b: 56 })).toBe("rgb(12, 34, 56)");
  });
});

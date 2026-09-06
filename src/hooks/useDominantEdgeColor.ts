import { useEffect, useState } from "react";

/**
 * Pure, DOM-free half of the hook below — kept separate specifically so
 * it's directly unit-testable without mocking Image/canvas. Averages
 * only the outer ring of pixels in a size x size RGBA buffer (the
 * pixels that actually reach the frame's edge), not the whole image, so
 * a colourful subject in the centre (a blue glove, a red vial) doesn't
 * pull the fill away from what the true background colour is. Returns
 * null for a buffer with no edge pixels at all (size < 1) rather than
 * dividing by zero.
 */
export function averageEdgeColor(data: Uint8ClampedArray | number[], size: number): { r: number; g: number; b: number } | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (!isEdge) continue;
      const i = (y * size + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
  }
  if (count === 0) return null;
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

export function rgbToCss(rgb: { r: number; g: number; b: number }): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

// Shared by every full-bleed banner (HeroBanner, HomeSections' story
// sections) that pairs a photo shown WHOLE (object-fit: contain, never
// cropped) with a full-bleed backdrop behind it. A photo with a plain
// studio background (like most of the doctor/lab photography this app
// uses) makes the existing blurred-copy backdrop read as a flat grey
// smear rather than a deliberate design choice — sampling the colour
// that actually touches the photo's own edges and using THAT as a flat
// fill looks like the photo was shot in front of that background,
// which is the effect actually wanted.
//
// Falls back to null (caller keeps its existing blurred-image backdrop)
// when: the image hasn't loaded yet, it fails to load, or reading its
// pixels throws (a "tainted canvas" SecurityError — happens if an image
// host ever serves without CORS headers; Cloudinary's own delivery URLs
// do, but this must never crash the page over a decorative background).
export function useDominantEdgeColor(imageUrl: string | undefined | null): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    setColor(null);
    if (!imageUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 12;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const rgb = averageEdgeColor(data, size);
        if (cancelled || !rgb) return;
        setColor(rgbToCss(rgb));
      } catch {
        if (!cancelled) setColor(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setColor(null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}

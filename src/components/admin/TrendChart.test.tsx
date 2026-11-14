import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TrendChart from "./TrendChart";

describe("TrendChart", () => {
  it("shows an honest empty state instead of an empty/broken chart when every value is zero", () => {
    const html = renderToStaticMarkup(
      <TrendChart series={[{ label: "Bookings", color: "blue", data: [{ x: "1 Sep", y: 0 }, { x: "2 Sep", y: 0 }] }]} />
    );
    expect(html).toContain("No data for this range.");
    expect(html).not.toContain("<svg");
  });

  it("shows the same empty state for a genuinely empty range", () => {
    const html = renderToStaticMarkup(<TrendChart series={[{ label: "Bookings", color: "blue", data: [] }]} />);
    expect(html).toContain("No data for this range.");
  });

  it("renders one bar per data point for a single real series, and no legend swatch row", () => {
    const data = [
      { x: "1 Sep", y: 3 },
      { x: "2 Sep", y: 5 },
      { x: "3 Sep", y: 0 },
    ];
    const html = renderToStaticMarkup(<TrendChart series={[{ label: "Bookings", color: "var(--color-primary)", data }]} />);
    const rectCount = (html.match(/<rect/g) ?? []).length;
    expect(rectCount).toBe(data.length);
    // Each bar's own hover tooltip legitimately names the series (e.g.
    // "Bookings — 1 Sep: 3") — what a single series should NOT get is
    // the separate legend swatch row (only meaningful once there's more
    // than one series to distinguish).
    expect(html).toContain("<title>Bookings");
    expect(html).not.toContain("border-radius:3px");
  });

  it("renders a legend and grouped bars when comparing two series", () => {
    const data = [
      { x: "1 Sep", y: 100 },
      { x: "2 Sep", y: 200 },
    ];
    const html = renderToStaticMarkup(
      <TrendChart
        series={[
          { label: "Revenue", color: "var(--color-success)", data },
          { label: "Ad spend", color: "var(--color-amber)", data: [{ x: "1 Sep", y: 20 }, { x: "2 Sep", y: 40 }] },
        ]}
      />
    );
    expect(html).toContain("Revenue");
    expect(html).toContain("Ad spend");
    const rectCount = (html.match(/<rect/g) ?? []).length;
    expect(rectCount).toBe(4); // 2 series x 2 days
  });

  it("formats a large gridline value with a k/L suffix rather than the raw number", () => {
    const data = [{ x: "1 Sep", y: 150000 }];
    const html = renderToStaticMarkup(<TrendChart series={[{ label: "Revenue", color: "green", data }]} />);
    // The axis ceiling for 150000 rounds up to a "nice" number and is
    // formatted in lakhs — the raw unformatted "150000" should never
    // appear as gridline text.
    expect(html).toMatch(/\dL/);
  });

  it("labels each bar with its real value for a small single-series chart", () => {
    const data = [
      { x: "1 Sep", y: 3 },
      { x: "2 Sep", y: 5 },
    ];
    const html = renderToStaticMarkup(<TrendChart series={[{ label: "Bookings", color: "blue", data }]} />);
    // One value label per non-zero bar, in addition to its hover title.
    expect(html).toContain(">3<");
    expect(html).toContain(">5<");
  });

  it("skips per-bar value labels once there are too many points or more than one series to stay readable", () => {
    const dense = Array.from({ length: 20 }, (_, i) => ({ x: `Day ${i + 1}`, y: i + 1 }));
    const denseHtml = renderToStaticMarkup(<TrendChart series={[{ label: "Bookings", color: "blue", data: dense }]} />);
    // fontWeight={700} is unique to the value-label <text>, not the
    // axis/x-axis label text — its absence here is the real signal.
    expect(denseHtml).not.toContain("font-weight=\"700\"");

    const twoSeries = [{ x: "1 Sep", y: 10 }];
    const twoSeriesHtml = renderToStaticMarkup(
      <TrendChart
        series={[
          { label: "Revenue", color: "green", data: twoSeries },
          { label: "Spend", color: "red", data: [{ x: "1 Sep", y: 2 }] },
        ]}
      />
    );
    expect(twoSeriesHtml).not.toContain("font-weight=\"700\"");
  });

  it("caps how many x-axis labels render so a long range doesn't overlap into an unreadable smear", () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ x: `Day ${i + 1}`, y: i + 1 }));
    const html = renderToStaticMarkup(<TrendChart series={[{ label: "Leads", color: "blue", data }]} />);
    const labelMatches = data.filter((d) => html.includes(`>${d.x}<`));
    expect(labelMatches.length).toBeLessThanOrEqual(9);
    expect(labelMatches.length).toBeGreaterThan(0);
  });
});

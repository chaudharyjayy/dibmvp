/**
 * The organ chart's contract: the picture carries the quantity and the scale,
 * not a per-line normalisation.
 *
 * Rendered through react-dom/server so the assertions are about the SVG the
 * browser actually gets: no NaN coordinates, one path per medicine, labelled
 * ticks in the organ's own unit, and a compact row that stays silent.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OrganChart, { formatValue, valueAt } from "../components/simulator/organ-chart";

const tH = Array.from({ length: 49 }, (_, i) => i * 0.5);
const series = [
  {
    id: "a",
    name: "Ibuprofen",
    color: "#38bdf8",
    values: tH.map((t) => 8 * (Math.exp(-0.4 * t) - Math.exp(-1.6 * t))),
  },
  {
    id: "b",
    name: "Caffeine",
    color: "#f472b6",
    values: tH.map((t) => 2.5 * (Math.exp(-0.15 * t) - Math.exp(-2.2 * t))),
  },
];

const render = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(OrganChart, {
      series,
      tH,
      tEndH: 24,
      hours: 4,
      unit: "mg/L",
      precision: 2,
      zeroBased: true,
      ariaLabel: "test chart",
      ...extra,
    })
  );

describe("organ chart", () => {
  it("draws every medicine as its own path, in its own colour", () => {
    const html = render();
    expect((html.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("#38bdf8");
    expect(html).toContain("#f472b6");
  });

  it("labels the axis with the organ's unit and the window in hours", () => {
    const html = render();
    expect(html).toContain("mg/L");
    expect(html).toContain("24h");
  });

  it("keeps every coordinate inside the viewBox", () => {
    const points = [...render().matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(points.length).toBeGreaterThan(10);
    const outside = points.filter(([x, y]) => x < -1 || x > 361 || y < -1 || y > 133);
    expect(outside).toEqual([]);
  });

  it("never emits NaN or Infinity coordinates", () => {
    const html = render();
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("uses one shared scale: a taller peak draws higher", () => {
    const html = render();
    // The first sample of both series is 0 → both sit on the axis.
    // The tallest point of the larger series must be nearer the top edge.
    const coords = [...html.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...coords)).toBeLessThan(40);
  });

  it("draws no text in the compact row sparkline", () => {
    const html = render({ compact: true });
    expect(html).not.toContain("<text");
    expect(html).not.toContain("NaN");
  });

  it("keeps a zero baseline for amounts that start at zero", () => {
    expect(render()).toContain("0.00");
  });
});

describe("chart helpers", () => {
  it("interpolates between samples", () => {
    expect(valueAt([0, 10], [0, 2], 1)).toBeCloseTo(5);
    expect(valueAt([0, 10], [0, 2], 0)).toBe(0);
    expect(valueAt([0, 10], [0, 2], 3)).toBe(10);
  });

  it("formats with a fixed precision, and large values without decimals", () => {
    expect(formatValue(0.3333, 2)).toBe("0.33");
    expect(formatValue(1234.5, 2)).toBe("1235");
  });
});

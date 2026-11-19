import { describe, expect, it } from "vitest";

import { tracePath } from "../components/simulator/organ-monitor";

/** Two runs with the same shape but different amplitudes. */
const SMALL = [0, 1, 2, 1, 0];
const LARGE = [0, 2, 4, 2, 0];

describe("organ monitor trace scaling", () => {
  it("auto-scales a lone trace to fill the box", () => {
    expect(tracePath(SMALL)).toMatch(/^M/);
    expect(tracePath([0, 0, 0, 0, 0])).toMatch(/^M0\.0 34\.0/);
    expect(tracePath([1])).toBe("");
  });

  it("hides equal-shape, different-size runs when each is scaled to its own peak", () => {
    // This is the old behaviour that made the two graphs look the same.
    expect(tracePath(SMALL)).toBe(tracePath(LARGE));
  });

  it("shows the real difference when both runs share one scale", () => {
    expect(tracePath(SMALL, 4)).not.toBe(tracePath(LARGE, 4));
  });
});

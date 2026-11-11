import { describe, expect, it } from "vitest";
import { DIAL_HOURS, curve, gutCurve, levelsAt } from "../components/landing/dial";

/**
 * The dial is illustrative, so these tests pin the shape's properties rather
 * than any real pharmacokinetic number: one peak, inside the axis, normalised
 * to 1, and organs wired to the curves the spec names.
 */
describe("dial curve", () => {
  it("starts at zero and stays inside 0..1 across the axis", () => {
    expect(curve(0)).toBe(0);
    for (let hours = 0; hours <= DIAL_HOURS; hours += 0.05) {
      const value = curve(hours);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("peaks once, around 1.3 h, at 1.0", () => {
    let peakHour = 0;
    let peak = 0;
    for (let hours = 0; hours <= DIAL_HOURS; hours += 0.01) {
      const value = curve(hours);
      if (value > peak) {
        peak = value;
        peakHour = hours;
      }
    }
    expect(peakHour).toBeGreaterThan(1.2);
    expect(peakHour).toBeLessThan(1.45);
    expect(peak).toBeCloseTo(1, 2);
  });

  it("clamps a negative argument to zero instead of going negative", () => {
    expect(curve(-0.5)).toBe(0);
    expect(curve(-3)).toBe(0);
  });
});

describe("gut curve", () => {
  it("starts full and empties monotonically", () => {
    expect(gutCurve(0)).toBeCloseTo(1, 6);
    let previous = gutCurve(0);
    for (let hours = 0.1; hours <= DIAL_HOURS; hours += 0.1) {
      const value = gutCurve(hours);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
    expect(gutCurve(DIAL_HOURS)).toBeLessThan(0.01);
  });
});

describe("levelsAt", () => {
  it("wires gut and stomach to the emptying curve", () => {
    const levels = levelsAt(0.5);
    expect(levels.gut).toBe(gutCurve(0.5));
    expect(levels.stomach).toBe(gutCurve(0.5));
  });

  it("wires lungs, heart and liver to the blood shape", () => {
    const levels = levelsAt(1.3);
    expect(levels.lungs).toBe(curve(1.3));
    expect(levels.heart).toBe(curve(1.3));
    expect(levels.liver).toBe(curve(1.3));
  });

  it("makes the kidneys lag half an hour behind", () => {
    expect(levelsAt(2).kidneys).toBeCloseTo(curve(1.5), 10);
    // At 0.2 h the lagged curve is negative, so the kidneys read 0.
    expect(levelsAt(0.2).kidneys).toBe(0);
  });

  it("keeps every level inside 0..1", () => {
    for (let hours = 0; hours <= DIAL_HOURS; hours += 0.1) {
      for (const value of Object.values(levelsAt(hours))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

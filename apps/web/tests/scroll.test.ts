import { describe, expect, it } from "vitest";
import {
  P_ABSORB_END,
  P_DISTRIBUTE_END,
  P_ELIMINATE_END,
  P_FADE_END,
  dialTarget,
  endAt,
  glowTarget,
  orbitTarget,
  phaseAt,
  zoomTarget,
} from "../components/landing/scroll";

const DEG = Math.PI / 180;

describe("dialTarget", () => {
  it("holds at zero through the fade and lands on each phase boundary", () => {
    expect(dialTarget(0)).toBe(0);
    expect(dialTarget(P_FADE_END)).toBe(0);
    expect(dialTarget(P_ABSORB_END)).toBeCloseTo(1.5, 10);
    expect(dialTarget(P_DISTRIBUTE_END)).toBeCloseTo(5, 10);
    expect(dialTarget(P_ELIMINATE_END)).toBeCloseTo(12, 10);
    expect(dialTarget(1)).toBeCloseTo(12, 10);
  });

  it("rises monotonically across the whole pin", () => {
    let previous = -1;
    for (let p = 0; p <= 1; p += 0.005) {
      const value = dialTarget(p);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("spends the most hours per unit of scroll in elimination", () => {
    const absorb = dialTarget(0.22) - dialTarget(0.14); // per 0.08 of scroll
    const distribute = dialTarget(0.5) - dialTarget(0.42);
    const eliminate = dialTarget(0.86) - dialTarget(0.78);
    // 1.5 h, 3.5 h and 7 h across equally long windows.
    expect(absorb).toBeLessThan(distribute);
    expect(distribute).toBeLessThan(eliminate);
  });
});

describe("orbitTarget", () => {
  it("sweeps from straight on to −20° and then to +10°", () => {
    expect(orbitTarget(P_FADE_END)).toBeCloseTo(0, 10);
    expect(orbitTarget(P_ABSORB_END)).toBeCloseTo(-20 * DEG, 10);
    expect(orbitTarget(P_DISTRIBUTE_END)).toBeCloseTo(10 * DEG, 10);
    expect(orbitTarget(1)).toBeCloseTo(10 * DEG, 10);
  });
});

describe("zoomTarget", () => {
  it("moves in for absorption and back out for elimination", () => {
    expect(zoomTarget(0)).toBeCloseTo(6.4, 10);
    expect(zoomTarget(P_ABSORB_END)).toBeCloseTo(5.4, 10);
    expect(zoomTarget(P_DISTRIBUTE_END)).toBeCloseTo(5.4, 10);
    expect(zoomTarget(P_ELIMINATE_END)).toBeCloseTo(6.0, 10);
  });
});

describe("glowTarget", () => {
  it("is dark until distribution and peaks inside it", () => {
    expect(glowTarget(P_ABSORB_END)).toBe(0);
    expect(glowTarget(0.5)).toBe(1);
    expect(glowTarget(0.7)).toBe(0);
  });
});

describe("phaseAt", () => {
  it("advances only past the boundary plus the dead band", () => {
    expect(phaseAt(0.09, 0)).toBe(0);
    expect(phaseAt(0.11, 0)).toBe(1);
    expect(phaseAt(0.35, 1)).toBe(1);
    expect(phaseAt(0.39, 1)).toBe(2);
    expect(phaseAt(0.67, 2)).toBe(3);
  });

  it("falls back only below the boundary minus the dead band", () => {
    expect(phaseAt(0.37, 2)).toBe(2);
    expect(phaseAt(0.33, 2)).toBe(1);
    expect(phaseAt(0.07, 1)).toBe(1);
    expect(phaseAt(0.05, 1)).toBe(0);
  });

  it("never leaves 0..3", () => {
    expect(phaseAt(0, 0)).toBe(0);
    expect(phaseAt(1, 3)).toBe(3);
  });
});

describe("endAt", () => {
  it("needs the dead band in both directions", () => {
    expect(endAt(0.93, false)).toBe(false);
    expect(endAt(0.95, false)).toBe(true);
    expect(endAt(0.91, true)).toBe(true);
    expect(endAt(0.89, true)).toBe(false);
  });
});

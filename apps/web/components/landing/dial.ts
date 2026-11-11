/**
 * The illustrative time dial.
 *
 * `c(t)` is a unitless shape — not a pharmacokinetic model, not fitted to any
 * drug, and deliberately without half-lives, doses or citations. It rises fast,
 * peaks around 1.3 h and decays slowly across a 12-hour axis. Organs follow it:
 * the gut empties on e^(-1.4t), the blood and liver follow c(t), and the kidneys
 * lag by half an hour.
 *
 * Kept free of Three.js and React so the dial strip, the figure and the tests
 * all read the same numbers.
 */

export type OrganId = "lungs" | "heart" | "liver" | "stomach" | "gut" | "kidneys";

export type OrganLevels = Partial<Record<OrganId, number>>;

/** The dial's axis: hours, 0 to 12. */
export const DIAL_HOURS = 12;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * c(t) = (e^(-0.35t) - e^(-1.4t)) / 0.472
 *
 * The divisor puts the peak at 1.0 (it lands at ~1.0006 around t = 1.32 h).
 * Outside the axis the result is clamped, so a negative argument (the kidney
 * lag just after zero) reads as 0 rather than as a negative level.
 */
export function curve(hours: number): number {
  return clamp01((Math.exp(-0.35 * hours) - Math.exp(-1.4 * hours)) / 0.472);
}

/** The gut empties on its own curve: e^(-1.4t). */
export function gutCurve(hours: number): number {
  return clamp01(Math.exp(-1.4 * hours));
}

/**
 * Which organs carry the accent at a given hour. Stomach and gut empty
 * together; lungs, heart and liver track the blood shape; kidneys run half an
 * hour behind it.
 */
export function levelsAt(hours: number): Record<OrganId, number> {
  const blood = curve(hours);
  const gut = gutCurve(hours);
  const lagged = curve(hours - 0.5);
  return {
    stomach: gut,
    gut,
    liver: blood,
    heart: blood,
    lungs: blood,
    kidneys: lagged,
  };
}

/**
 * Scroll mapping for the pinned hero.
 *
 * The page scrolls natively; progress `p` runs 0→1 over the 300svh between the
 * 100svh stage and the bottom of the 400svh wrapper. These pure functions turn
 * `p` into the dial's hour, the camera's orbit and distance, the particle glow
 * and the phase index. Kept free of React and Three.js so the hero and the
 * tests read the same numbers.
 */

import { DIAL_HOURS } from "./dial";

/** Scroll-window boundaries, from the landing spec. */
export const P_FADE_END = 0.08;
export const P_ABSORB_END = 0.36;
export const P_DISTRIBUTE_END = 0.64;
export const P_ELIMINATE_END = 0.92;

/** Captions and the end state need a dead band, or they flicker at a boundary. */
export const HYSTERESIS = 0.02;

const DEG = Math.PI / 180;
/** Camera distance at the hero, during absorption and at the end. */
const Z_HERO = 6.4;
const Z_ABSORB = 5.4;
const Z_END = 6.0;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Progress through [start, end], clamped. */
function range(value: number, start: number, end: number): number {
  return clamp01((value - start) / (end - start));
}

/** Dial hours for a scroll position. The shape is illustrative, not a dose. */
export function dialTarget(p: number): number {
  if (p <= P_FADE_END) return 0;
  if (p <= P_ABSORB_END) return 1.5 * range(p, P_FADE_END, P_ABSORB_END);
  if (p <= P_DISTRIBUTE_END) return 1.5 + 3.5 * range(p, P_ABSORB_END, P_DISTRIBUTE_END);
  return 5 + (DIAL_HOURS - 5) * range(p, P_DISTRIBUTE_END, P_ELIMINATE_END);
}

/** Camera orbit in radians: 0 → −20° while absorbing, −20° → +10° after. */
export function orbitTarget(p: number): number {
  if (p <= P_ABSORB_END) return -20 * DEG * range(p, P_FADE_END, P_ABSORB_END);
  if (p <= P_DISTRIBUTE_END) {
    return (-20 + 30 * range(p, P_ABSORB_END, P_DISTRIBUTE_END)) * DEG;
  }
  return 10 * DEG;
}

/** Camera distance: in during absorption, out again during elimination. */
export function zoomTarget(p: number): number {
  if (p <= P_ABSORB_END) return Z_HERO + (Z_ABSORB - Z_HERO) * range(p, P_FADE_END, P_ABSORB_END);
  if (p <= P_DISTRIBUTE_END) return Z_ABSORB;
  return Z_ABSORB + (Z_END - Z_ABSORB) * range(p, P_DISTRIBUTE_END, P_ELIMINATE_END);
}

/** Extra brightness on the circulating particles while distribution is active. */
export function glowTarget(p: number): number {
  if (p <= P_ABSORB_END) return 0;
  if (p <= 0.46) return range(p, P_ABSORB_END, 0.46);
  if (p <= 0.56) return 1;
  return 1 - range(p, 0.56, 0.68);
}

const PHASE_BOUNDARIES = [P_FADE_END, P_ABSORB_END, P_DISTRIBUTE_END];

/** Phase index (0–3) for a scroll position, with a dead band per boundary. */
export function phaseAt(p: number, current: number): number {
  let next = current;
  while (next < 3 && p > PHASE_BOUNDARIES[next] + HYSTERESIS) next += 1;
  while (next > 0 && p < PHASE_BOUNDARIES[next - 1] - HYSTERESIS) next -= 1;
  return next;
}

/** True once the pin has effectively ended and the closing CTA owns the stage. */
export function endAt(p: number, current: boolean): boolean {
  return current ? p > P_ELIMINATE_END - HYSTERESIS : p > P_ELIMINATE_END + HYSTERESIS;
}

/**
 * Motion tokens for the simulator.
 *
 * The landing page has its own entrance timings in
 * `components/landing/load.ts`. These are the simulator's, kept apart so the
 * two surfaces can move at their own pace without a shared file full of
 * flags. The shape of both is the same: a name, a duration and a distance,
 * so a one-off number never creeps in.
 *
 * The rules these follow come from the house style and from `docs/DESIGN.md`:
 *
 *  - Transform and opacity only. Nothing animates width, height, top or
 *    left, because that is what makes a page reflow while it moves.
 *  - Reduced motion turns the movement off and leaves the state. A fade is
 *    not movement, and the state change still has to be visible.
 *  - Nothing flashes faster than 3x/second (WCAG 2.3.1).
 */

import type { CSSProperties } from "react";

/** How long a state change takes. */
export const DURATION = {
  /** A press, a hover, a chip. */
  fast: 140,
  /** A panel landing, a value changing. */
  normal: 260,
  /** A whole column arriving. */
  slow: 520,
} as const;

/** The curves. Both are CSS easing functions, not cubic-bezier arrays. */
export const EASE = {
  /** Decisive: state changes. */
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Symmetric: things that move in and out. */
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

/** How far something travels when it arrives. */
export const DISTANCE = {
  small: 6,
  medium: 14,
  large: 26,
} as const;

/**
 * The entrance for a piece of the simulator.
 *
 * The delay is the beat: the columns arrive in the order they are read.
 */
export function rise(delay: number, distance = DISTANCE.medium): CSSProperties {
  return {
    "--rise-delay": `${delay}ms`,
    "--rise-distance": `${distance}px`,
  } as CSSProperties;
}

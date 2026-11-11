import type { CSSProperties } from "react";

/**
 * Entrance timings, from the landing spec:
 *   caption 80ms · H1 lines 60ms stagger over 560ms · figure 700ms from 200ms ·
 *   dial strip rising at 600ms over 320ms.
 *
 * The spec gives a duration for the H1 lines ("over 560ms") and only a start
 * for the rest, so the starts below are chosen to keep one continuous beat:
 * caption, then the headline, then the body and the call to action with the
 * last line, then the figure, then the dial.
 *
 * Rendered as a CSS animation, not a JS one: it runs before hydration, has no
 * layout-thrash, and `animation-fill-mode: both` means nothing flashes at its
 * final position first. `prefers-reduced-motion` cancels it in globals.css.
 */
export const LOAD = {
  caption: { delay: 80, duration: 400, y: 8 },
  h1: { delay: 120, stagger: 60, duration: 560, y: 16 },
  body: { delay: 340, duration: 440, y: 12 },
  actions: { delay: 400, duration: 440, y: 12 },
  figure: { delay: 200, duration: 700, y: 24 },
  dial: { delay: 600, duration: 320, y: 16 },
} as const;

/** Inline custom properties consumed by the `.landing-load` keyframes. */
export function riseStyle(delay: number, duration: number, y = 16): CSSProperties {
  return {
    "--rise-delay": `${delay}ms`,
    "--rise-duration": `${duration}ms`,
    "--rise-y": `${y}px`,
  } as CSSProperties;
}

/** Staggered start for the nth headline line. */
export function h1Style(index: number): CSSProperties {
  return riseStyle(
    LOAD.h1.delay + index * LOAD.h1.stagger,
    LOAD.h1.duration,
    LOAD.h1.y
  );
}

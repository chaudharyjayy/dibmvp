/**
 * cubic-bezier evaluation, so motion in JS matches the CSS transitions on the
 * page. `cubicBezier(x1, y1, x2, y2)` returns f(x) exactly as CSS would.
 */

const NEWTON_ITERATIONS = 6;
const EPSILON = 1e-5;

export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    const clamped = x <= 0 ? 0 : x >= 1 ? 1 : x;
    let t = clamped;
    for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
      const error = sampleX(t) - clamped;
      if (Math.abs(error) < EPSILON) break;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    // Newton can run outside [0, 1] on a near-flat slope; bisect back.
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return sampleY(t);
  };
}

/** The page's default easing: cubic-bezier(0.22, 1, 0.36, 1). */
export const EASE_OUT = cubicBezier(0.22, 1, 0.36, 1);

/** The dial's autoplay easing: cubic-bezier(0.65, 0, 0.35, 1). */
export const EASE_IN_OUT = cubicBezier(0.65, 0, 0.35, 1);

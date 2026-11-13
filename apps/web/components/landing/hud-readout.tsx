"use client";

/**
 * The right-hand HUD column: a live readout of the model's own state.
 *
 * Every number on this panel is computed from the same illustrative curve the
 * dial uses — the organ bars read levelsAt(t), the graph plots curve(t), the
 * time-to-<5% figure is solved from the curve. Nothing here is patient data;
 * the panel says "MODEL" so it cannot be mistaken for a monitor.
 *
 * Painting is ref-based inside one rAF loop, so 60fps never re-renders React.
 */

import { useEffect, useRef } from "react";
import { curve, DIAL_HOURS, levelsAt } from "./dial";
import type { FigureScene } from "./figure-scene";

const W = 248;
const H = 88;
const SAMPLES = 96;

/** The illustrative hill, drawn once. */
const PATH = (() => {
  let d = "";
  for (let i = 0; i <= SAMPLES; i++) {
    const x = (i / SAMPLES) * W;
    const y = H - 3 - curve((i / SAMPLES) * DIAL_HOURS) * (H - 6);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
})();
const FILL = `${PATH} L${W} ${H} L0 ${H} Z`;

/** Time at which curve() falls back to 5% of its peak. Static for one curve. */
const T_TO_05 = (() => {
  for (let t = 2; t <= DIAL_HOURS; t += 0.05) {
    if (curve(t) <= 0.05) return t;
  }
  return DIAL_HOURS;
})();

const ORGANS = [
  { id: "liver", label: "LIVER" },
  { id: "lungs", label: "LUNGS" },
  { id: "heart", label: "HEART" },
  { id: "kidneys", label: "KIDNEYS" },
] as const;

export type HudReadoutProps = {
  scene: FigureScene | null;
  /** Dimmed to match the phase captions when the phase ends. */
  active: boolean;
};

export default function HudReadout({ scene, active }: HudReadoutProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const levelRef = useRef<HTMLSpanElement | null>(null);
  const playheadRef = useRef<SVGLineElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const barValRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = scene ? scene.getTime() : 0;
      const levels = levelsAt(t);
      const level = curve(t);

      if (timeRef.current) timeRef.current.textContent = t.toFixed(1);
      if (levelRef.current) levelRef.current.textContent = level.toFixed(2);

      const x = (t / DIAL_HOURS) * W;
      const y = H - 3 - level * (H - 6);
      playheadRef.current?.setAttribute("x1", x.toFixed(1));
      playheadRef.current?.setAttribute("x2", x.toFixed(1));
      dotRef.current?.setAttribute("cx", x.toFixed(1));
      dotRef.current?.setAttribute("cy", y.toFixed(1));

      ORGANS.forEach((organ, i) => {
        const value = levels[organ.id] ?? 0;
        const bar = barRefs.current[i];
        if (bar) bar.style.transform = `scaleX(${Math.max(0.02, value).toFixed(3)})`;
        const label = barValRefs.current[i];
        if (label) label.textContent = value.toFixed(2);
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div
      ref={rootRef}
      data-hud-readout
      className={`hud-panel flex w-[248px] flex-col px-4 py-4 transition-opacity duration-[240ms] ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-text">
          Model // Readout
        </p>
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
      </div>

      {/* Organ bars ---------------------------------------------------- */}
      <div className="mt-4 space-y-2.5">
        {ORGANS.map((organ, i) => (
          <div key={organ.id} className="grid grid-cols-[52px_1fr_30px] items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
              {organ.label}
            </span>
            <span className="h-[6px] overflow-hidden rounded-full bg-line-strong/60">
              <span
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                className="block h-full w-full origin-left rounded-full bg-gradient-to-r from-brand/40 to-brand"
                style={{ transform: "scaleX(0.02)" }}
              />
            </span>
            <span
              ref={(el) => {
                barValRefs.current[i] = el;
              }}
              className="text-right font-mono text-[10px] tabular-nums text-brand-text"
            >
              0.00
            </span>
          </div>
        ))}
      </div>

      {/* The hill, larger than the dial's sparkline --------------------- */}
      <div className="mt-5 border-t border-line pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Plasma Level — Unitless
        </p>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-2 h-[88px] w-full"
          role="img"
          aria-label="Illustrative curve of the drug level over twelve hours"
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="var(--line)"
              strokeWidth={1}
              strokeDasharray="2 5"
            />
          ))}
          <path d={FILL} fill="var(--accent-fill)" opacity={0.1} />
          <path d={PATH} fill="none" stroke="var(--accent-fill)" strokeWidth={2} strokeLinejoin="round" />
          <line ref={playheadRef} x1={0} x2={0} y1={0} y2={H} stroke="var(--accent-fill)" strokeWidth={1} opacity={0.75} />
          <circle ref={dotRef} cx={0} cy={0} r={3.5} fill="var(--accent-fill)" />
        </svg>
        <p className="mt-1 flex items-baseline justify-between font-mono text-[11px] tabular-nums text-ink-3">
          <span>0 h</span>
          <span>6 h</span>
          <span>12 h</span>
        </p>
      </div>

      {/* The two numbers the curve actually carries --------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[8px] border border-line bg-page/40 px-3 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">T +</p>
          <p className="mt-1 font-mono text-[16px] leading-5 tabular-nums text-ink">
            <span ref={timeRef}>0.0</span>
            <span className="text-ink-2"> h</span>
          </p>
        </div>
        <div className="rounded-[8px] border border-line bg-page/40 px-3 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">Level</p>
          <p className="mt-1 font-mono text-[16px] leading-5 tabular-nums text-ink">
            <span ref={levelRef}>0.00</span>
            <span className="text-ink-2"> / 1</span>
          </p>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-3 font-mono text-[10px] leading-4 text-ink-3">
        ↓ to 5% of peak ≈ {T_TO_05.toFixed(1)} h<br />
        illustrative shape, not a real drug
      </p>
    </div>
  );
}

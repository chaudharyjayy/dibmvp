"use client";

/**
 * The HUD reticle: a marker that locks onto whichever organ currently holds
 * the highest drug level.
 *
 * It is the one piece of HUD on the page that carries information. The value
 * it shows is read straight from the model's own levels, and the label says
 * "model" so it cannot be mistaken for live patient telemetry — this page
 * simulates, it does not monitor anyone.
 *
 * It is drawn with plain DOM and SVG and updated inside a rAF loop, so it
 * never causes a React render.
 */

import { useEffect, useRef } from "react";
import type { FigureScene, OrganId } from "./figure-scene";

const LABELS: Record<string, string> = {
  liver: "LIVER",
  heart: "HEART",
  lungs: "LUNGS",
  kidneys: "KIDNEY",
};

/** Half the reticle's box, in CSS pixels. */
const SIZE = 30;

export type ReticleProps = {
  /** The live scene; null until the model has loaded. */
  scene: FigureScene | null;
};

export default function Reticle({ scene }: ReticleProps) {
  const boxRef = useRef<SVGGElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const leaderRef = useRef<SVGLineElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scene) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let x = 0;
    let y = 0;
    let started = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const peak = scene.getPeakOrgan();
      const anchor = peak ? scene.getOrganAnchor(peak.id) : null;
      const group = boxRef.current;
      const label = labelRef.current;
      const leader = leaderRef.current;
      if (!group || !label || !leader) return;

      if (!peak || !anchor) {
        group.style.opacity = "0";
        leader.style.opacity = "0";
        label.style.opacity = "0";
        return;
      }

      // Ease towards the target so re-targeting glides rather than snaps.
      if (!started) {
        x = anchor.x;
        y = anchor.y;
        started = true;
      } else if (reduced) {
        x = anchor.x;
        y = anchor.y;
      } else {
        x += (anchor.x - x) * 0.12;
        y += (anchor.y - y) * 0.12;
      }

      group.style.opacity = "1";
      group.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);

      const labelText = `${LABELS[peak.id as OrganId] ?? peak.id.toUpperCase()} · MODEL ${peak.level.toFixed(2)}`;
      if (label.textContent !== labelText) label.textContent = labelText;

      // The leader runs from the reticle up and to the right, and the label
      // sits at its end. It flips to the left when the reticle nears the
      // right edge so the readout never leaves the canvas.
      const width = frameRef.current?.clientWidth ?? 0;
      const flip = width > 0 && x > width - 140;
      const endX = flip ? -SIZE - 12 : SIZE + 12;
      const endY = -SIZE - 10;
      leader.setAttribute("x1", String(flip ? -SIZE / 2 : SIZE / 2));
      leader.setAttribute("y1", String(-SIZE / 2));
      leader.setAttribute("x2", String(endX));
      leader.setAttribute("y2", String(endY));
      leader.style.opacity = "1";
      label.style.opacity = "1";
      // The label is a sibling of the SVG group, so it needs the reticle's
      // own position added to the leader's offset.
      label.style.transform = `translate(${(x + endX).toFixed(1)}px, ${(y + endY).toFixed(
        1
      )}px) translate(${flip ? "-100%" : "0"}, -50%)`;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div ref={frameRef} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <g ref={boxRef} style={{ opacity: 0 }}>
          {/* Four corner brackets: the reticle's frame. */}
          <path
            d={`M ${-SIZE} ${-SIZE + 10} L ${-SIZE} ${-SIZE} L ${-SIZE + 10} ${-SIZE}`}
            fill="none"
            stroke="var(--accent-fill)"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d={`M ${SIZE} ${-SIZE + 10} L ${SIZE} ${-SIZE} L ${SIZE - 10} ${-SIZE}`}
            fill="none"
            stroke="var(--accent-fill)"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d={`M ${-SIZE} ${SIZE - 10} L ${-SIZE} ${SIZE} L ${-SIZE + 10} ${SIZE}`}
            fill="none"
            stroke="var(--accent-fill)"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d={`M ${SIZE} ${SIZE - 10} L ${SIZE} ${SIZE} L ${SIZE - 10} ${SIZE}`}
            fill="none"
            stroke="var(--accent-fill)"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <line
            ref={leaderRef}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            stroke="var(--accent-fill)"
            strokeWidth="1"
            strokeOpacity="0.7"
            style={{ opacity: 0 }}
          />
        </g>
      </svg>
      <span
        ref={labelRef}
        className="absolute left-0 top-0 whitespace-nowrap rounded-[4px] border border-line-strong bg-page/85 px-2 py-1 font-mono text-[11px] uppercase leading-4 tracking-[0.12em] text-accent-text tabular-nums backdrop-blur-sm"
        style={{ opacity: 0 }}
      />
    </div>
  );
}

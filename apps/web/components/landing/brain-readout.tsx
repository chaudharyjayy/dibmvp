"use client";

/**
 * The brain readout: the name of the part of the brain under the pointer.
 *
 * The model is real anatomy, so the answer is a real anatomical name — the
 * gyrus that was hit, and the lobe it belongs to. It is a model readout, not
 * a measurement, and it says so.
 *
 * It is drawn in plain DOM and updated from a rAF loop, so pointing at the
 * figure never causes a React render.
 */

import { useEffect, useRef } from "react";
import type { BrainRegion } from "./brain-regions";
import type { FigureScene } from "./figure-scene";

type BrainReadoutProps = {
  /** The live scene; null until the model has loaded. */
  scene: FigureScene | null;
  /** The canvas the figure is drawn on, so the readout can stay inside it. */
  canvas: HTMLCanvasElement | null;
};

export default function BrainReadout({ scene, canvas }: BrainReadoutProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const partRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!scene) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let x = 0;
    let y = 0;
    let started = false;
    let shown = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const hit = scene.getBrainRegion();
      const box = boxRef.current;
      const label = labelRef.current;
      const part = partRef.current;
      if (!box || !label || !part) return;

      if (!hit) {
        if (shown) {
          shown = false;
          box.style.opacity = "0";
        }
        return;
      }

      if (!started) {
        x = hit.x;
        y = hit.y;
        started = true;
      } else if (reduced) {
        x = hit.x;
        y = hit.y;
      } else {
        // Ease towards the target so the readout does not jitter as the
        // pointer moves across a sulcus.
        x += (hit.x - x) * 0.25;
        y += (hit.y - y) * 0.25;
      }

      const { region } = hit;
      if (label.textContent !== region.display) label.textContent = region.display;
      if (part.textContent !== region.part) part.textContent = region.part;

      // The readout is anchored at the pointer but kept inside the canvas: a
      // gyrus near the edge of the head would otherwise push it off the frame
      // and lose the text.
      const width = canvas?.clientWidth || 0;
      const height = canvas?.clientHeight || 0;
      const boxWidth = box.offsetWidth || 220;
      const boxHeight = box.offsetHeight || 24;
      const left = width ? Math.max(4, Math.min(x + 14, width - boxWidth - 4)) : x + 14;
      const top = height ? Math.max(4, Math.min(y - boxHeight - 10, height - boxHeight - 4)) : y - boxHeight - 10;

      box.style.opacity = "1";
      box.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      shown = true;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-10 max-w-[min(280px,calc(100%-8px))] truncate rounded-[4px] border border-line-strong bg-page/85 px-2 py-1 font-mono text-[11px] uppercase leading-4 tracking-[0.12em] text-accent-text tabular-nums backdrop-blur-sm"
      style={{ opacity: 0, transform: "translate3d(0px, 0px, 0)" }}
    >
      <span ref={labelRef} className="block truncate" />
      <span ref={partRef} className="block truncate normal-case tracking-normal text-ink-2" />
    </div>
  );
}

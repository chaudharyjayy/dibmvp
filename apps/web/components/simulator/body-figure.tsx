"use client";

/**
 * The model viewport: the canvas the anatomy is drawn on, with the HUD
 * furniture around it.
 *
 * React owns the canvas and the overlays; the Three.js scene is imported
 * lazily so `three` never lands in the first payload and never runs during
 * SSR.
 *
 * The overlays are plain DOM driven from a rAF loop, so moving the camera and
 * pointing at the brain never cause a React render.
 */

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { BrainRegion } from "@/components/anatomy/regions";
import type { FocusOrgan, SimulatorScene } from "./scene";

export type SceneStatus = "loading" | "ready" | "error";

type BodyFigureProps = {
  /** The live scene, for the overlays. */
  scene: SimulatorScene | null;
  /** The organ the walkthrough is about, for the label over the model. */
  focus: FocusOrgan | null;
  /** The name shown in the label over the model. */
  focusLabel: string | null;
  /** Hands the scene to the parent so it can drive it. */
  onScene?: (scene: SimulatorScene | null) => void;
  /** The brain region under the pointer. */
  onBrainRegion?: (region: BrainRegion | null) => void;
  /** Called when the pointer rests on an organ. */
  onOrganHover?: (hover: { organ: FocusOrgan; x: number; y: number } | null) => void;
  /** The readout shown in the hover tooltip for the organ under the pointer. */
  organData?: (organ: FocusOrgan) => { title: string; lines: string[] };
  /** Shows the failed-model state over the figure. */
  dead?: boolean;
  /** The cause of failure, named in the overlay. */
  deathMessage?: string | null;
  /** The lower comparison figure: no scan, no walkthrough label. */
  healthy?: boolean;
  className?: string;
};

export default function BodyFigure({
  scene,
  focus,
  focusLabel,
  onScene,
  onBrainRegion,
  onOrganHover,
  organData,
  dead = false,
  deathMessage = null,
  healthy = false,
  className = "",
}: BodyFigureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onSceneRef = useRef(onScene);
  const onBrainRegionRef = useRef(onBrainRegion);
  const onOrganHoverRef = useRef(onOrganHover);
  const [status, setStatus] = useState<SceneStatus>("loading");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hover, setHover] = useState<{ organ: FocusOrgan; x: number; y: number } | null>(null);

  useEffect(() => {
    onSceneRef.current = onScene;
    onBrainRegionRef.current = onBrainRegion;
    onOrganHoverRef.current = onOrganHover;
  }, [onScene, onBrainRegion, onOrganHover]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The scene is created once per mount; a retry re-runs the effect.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: SimulatorScene | null = null;
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    const coarse = window.matchMedia("(pointer: coarse)").matches;

    import("./scene").then(({ createSimulatorScene }) => {
      if (cancelled) return;
      scene = createSimulatorScene(canvas, {
        reducedMotion,
        maxDpr: coarse ? 1.5 : 2,
        onStatus: setStatus,
        onBrainRegion: (region) => onBrainRegionRef.current?.(region),
        onOrganHover: (next) => {
          setHover(next);
          onOrganHoverRef.current?.(next);
        },
      });
      onSceneRef.current?.(scene);

      // The scene sleeps while it is out of sight: a background tab should
      // not spend the battery drawing a body nobody is looking at.
      observer = new IntersectionObserver(
        ([entry]) => scene?.setPaused(!entry.isIntersecting),
        { threshold: 0 }
      );
      observer.observe(canvas);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      scene?.dispose();
      onSceneRef.current?.(null);
    };
  }, [reducedMotion, reloadKey]);

  /* The label over the focused organ ---------------------------------- */

  const labelRef = useRef<HTMLDivElement | null>(null);
  const crossRef = useRef<HTMLDivElement | null>(null);
  const brainRef = useRef<HTMLDivElement | null>(null);
  const brainLabelRef = useRef<HTMLSpanElement | null>(null);
  const brainPartRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!scene) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let bx = 0;
    let by = 0;
    let started = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (!canvas) return;

      // The reticle over the focused organ. The name lives in the corner
      // tag, so nothing sits on top of the anatomy.
      const cross = crossRef.current;
      if (cross) {
        const point = scene.getFocusPoint();
        if (point) {
          cross.style.opacity = "1";
          cross.style.transform = `translate3d(${(point.x - 13).toFixed(1)}px, ${(
            point.y - 13
          ).toFixed(1)}px, 0)`;
        } else {
          cross.style.opacity = "0";
        }
      }

      // The brain readout.
      const brainBox = brainRef.current;
      const brainLabel = brainLabelRef.current;
      const brainPart = brainPartRef.current;
      if (!brainBox || !brainLabel || !brainPart) return;

      const hit = scene.getBrainRegion();
      if (!hit) {
        brainBox.style.opacity = "0";
        return;
      }
      if (!started) {
        bx = hit.x;
        by = hit.y;
        started = true;
      } else if (reduced) {
        bx = hit.x;
        by = hit.y;
      } else {
        bx += (hit.x - bx) * 0.25;
        by += (hit.y - by) * 0.25;
      }
      if (brainLabel.textContent !== hit.region.display) {
        brainLabel.textContent = hit.region.display;
      }
      if (brainPart.textContent !== hit.region.part) {
        brainPart.textContent = hit.region.part;
      }
      const width = canvas.clientWidth || 0;
      const height = canvas.clientHeight || 0;
      const boxWidth = brainBox.offsetWidth || 220;
      const boxHeight = brainBox.offsetHeight || 24;
      const left = width ? Math.max(4, Math.min(bx + 14, width - boxWidth - 4)) : bx + 14;
      const top = height
        ? Math.max(4, Math.min(by - boxHeight - 10, height - boxHeight - 4))
        : by - boxHeight - 10;
      brainBox.style.opacity = "1";
      brainBox.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="A see-through human figure. The camera moves to each organ as the walkthrough scrolls, and the organs glow with the simulated drug level."
        className="block h-full w-full touch-pan-y select-none"
      />

      {/* The reticle over the focused organ. */}
      <div
        ref={crossRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-10 h-[26px] w-[26px] rounded-full border border-brand/70"
        style={{ opacity: 0, transform: "translate3d(0px, 0px, 0)" }}
      >
        <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-text" />
      </div>

      {/* The organ the walkthrough is about, named in the corner. */}
      <div
        ref={labelRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-3 z-10 max-w-[70%] rounded-[4px] border border-brand/50 bg-page/80 px-2.5 py-1.5 font-mono text-[11px] uppercase leading-4 tracking-[0.14em] text-brand-text backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: focus ? 1 : 0 }}
      >
        {focusLabel ?? ""}
      </div>

      {/* The part of the brain under the pointer. */}
      <div
        ref={brainRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-10 max-w-[min(280px,calc(100%-8px))] truncate rounded-[4px] border border-line-strong bg-page/85 px-2 py-1 font-mono text-[11px] uppercase leading-4 tracking-[0.12em] text-brand-text backdrop-blur-sm"
        style={{ opacity: 0, transform: "translate3d(0px, 0px, 0)" }}
      >
        <span ref={brainLabelRef} className="block truncate" />
        <span ref={brainPartRef} className="block truncate normal-case tracking-normal text-ink-2" />
      </div>

      {/* Hover readout: this organ's data from the very same engine numbers. */}
      {hover && organData && !healthy ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 max-w-[min(260px,calc(100%-8px))] rounded-[6px] border border-brand/60 bg-page/95 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          style={{
            left: Math.max(4, Math.min(hover.x + 14, (canvasRef.current?.clientWidth ?? 400) - 220)),
            top: Math.max(4, hover.y + 12),
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand-text">
            {organData(hover.organ).title}
          </p>
          {organData(hover.organ).lines.map((line) => (
            <p key={line} className="mt-0.5 font-mono text-[11px] tabular-nums text-ink">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* The failed state, named plainly over the model. */}
      {dead ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center bg-rose-950/25 p-4">
          <div className="max-w-[90%] rounded-[8px] border border-rose-500/60 bg-page/95 px-3 py-2 text-center backdrop-blur-sm">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rose-400">
              Model failed
            </p>
            {deathMessage ? (
              <p className="mt-1 text-[12px] leading-5 text-ink">{deathMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {healthy ? (
        <p className="pointer-events-none absolute left-3 top-3 z-10 rounded-[4px] border border-line bg-page/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 backdrop-blur-sm">
          Healthy reference
        </p>
      ) : null}

      {/* The model's own state, said plainly. */}
      {status !== "ready" ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 text-center"
        >
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-2">
            {status === "loading" ? "Model // loading" : "Model // unavailable"}
          </p>
          {status === "error" ? (
            <>
              <p className="max-w-[280px] text-[14px] leading-5 text-ink-2">
                The anatomy could not be loaded. The numbers below still work.
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="pointer-events-auto flex items-center gap-2 rounded-[10px] border border-line-strong px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-brand-text hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Try again
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {focus ? null : (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[12px] leading-4 tracking-[0.08em] text-ink-2"
        >
          Scroll to walk the body
        </p>
      )}
    </div>
  );
}

"use client";

/**
 * The interactive glass figure. React owns the canvas and the input surface;
 * the Three.js scene is loaded lazily so `three` never lands in the first
 * payload and never runs during SSR.
 *
 * Turning: auto-rotation at 0.12 rad/s until the visitor touches it, drag with
 * 0.92 damping per frame, ±15° pitch, two 44px chevrons that each turn 15°
 * over 320ms, and arrow keys on the focusable canvas.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FigureScene } from "./figure-scene";

const TURN_RADIANS = (15 * Math.PI) / 180;
const TURN_MS = 320;

export default function GlassFigure() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: FigureScene | null = null;
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    const coarse = window.matchMedia("(pointer: coarse)").matches;

    import("./figure-scene").then(({ createFigureScene }) => {
      if (cancelled) return;
      scene = createFigureScene(canvas, {
        reducedMotion,
        maxDpr: coarse ? 1.5 : 2,
      });
      sceneRef.current = scene;
      // Text measurement hook: renderer counters for the last frame.
      (window as Window & { __dibFigure?: FigureScene }).__dibFigure = scene;

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
      sceneRef.current = null;
    };
  }, [reducedMotion]);

  const noteInteraction = useCallback(() => {
    setInteracted(true);
    sceneRef.current?.stopAutoRotate();
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      noteInteraction();
      dragRef.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [noteInteraction]
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    sceneRef.current?.dragBy(event.clientX - drag.x, event.clientY - drag.y);
    dragRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      noteInteraction();
      sceneRef.current?.turnBy(event.key === "ArrowLeft" ? -TURN_RADIANS : TURN_RADIANS, TURN_MS);
    },
    [noteInteraction]
  );

  const turn = useCallback(
    (direction: -1 | 1) => {
      noteInteraction();
      sceneRef.current?.turnBy(direction * TURN_RADIANS, TURN_MS);
    },
    [noteInteraction]
  );

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="A see-through human figure with organs that tint as drug level rises. Drag, or press the left and right arrow keys, to turn it."
        className="block h-full w-full touch-pan-y select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />

      <button
        type="button"
        aria-label="Turn the figure left"
        onClick={() => turn(-1)}
        className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/90 text-ink-2 outline-none transition-colors hover:border-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:left-3"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label="Turn the figure right"
        onClick={() => turn(1)}
        className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/90 text-ink-2 outline-none transition-colors hover:border-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:right-3"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </button>

      <p
        data-figure-caption
        aria-hidden={interacted}
        className={`pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[12px] leading-4 tracking-[0.08em] text-ink-2 transition-opacity duration-[400ms] ${
          interacted ? "opacity-0" : "opacity-100"
        }`}
      >
        Drag or use arrows
      </p>
    </div>
  );
}

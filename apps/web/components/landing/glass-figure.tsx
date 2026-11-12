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

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FigureScene, FigureStatus } from "./figure-scene";

const TURN_RADIANS = (15 * Math.PI) / 180;
const TURN_MS = 320;

type GlassFigureProps = {
  /** Hands the live scene to the parent so the dial can drive it. */
  onScene?: (scene: FigureScene | null) => void;
  /** Hands the canvas to the parent, so overlays can measure themselves
   *  against it. */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
};

export default function GlassFigure({ onScene, onCanvas }: GlassFigureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const onSceneRef = useRef(onScene);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  /** The model's load state. The figure area says so rather than sitting empty. */
  const [status, setStatus] = useState<FigureStatus>("loading");

  useEffect(() => {
    onSceneRef.current = onScene;
  }, [onScene]);

  const onCanvasRef = useRef(onCanvas);
  useEffect(() => {
    onCanvasRef.current = onCanvas;
  }, [onCanvas]);

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

    onCanvasRef.current?.(canvas);

    import("./figure-scene").then(({ createFigureScene }) => {
      if (cancelled) return;
      scene = createFigureScene(canvas, {
        reducedMotion,
        maxDpr: coarse ? 1.5 : 2,
        onStatus: setStatus,
      });
      sceneRef.current = scene;
      // Text measurement hook: renderer counters for the last frame.
      (window as Window & { __dibFigure?: FigureScene }).__dibFigure = scene;
      onSceneRef.current?.(scene);

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
      onSceneRef.current?.(null);
      onCanvasRef.current?.(null);
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

  const ready = status === "ready";

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="A see-through human figure whose organs tint as the illustrative drug level rises."
        aria-describedby="figure-help"
        className="block h-full w-full touch-pan-y select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />

      {/* The figure carries no data of its own: the dial is the control and the
          level it sets is what the organs show. Saying that here stops the
          rotation from reading as a control the visitor is missing. */}
      <p id="figure-help" className="sr-only">
        Turn it with a drag, the left and right arrow keys, or the two buttons beside it. Turning
        only changes the view; the time dial under the figure changes the drug level.
      </p>

      {/* The model's own state, said plainly. A 1.7 MB model takes a moment, and
          a failed load must not leave a stranger floating in an empty frame. */}
      {status !== "ready" && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 text-center"
        >
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-2">
            {status === "loading" ? "Model // loading" : "Model // unavailable"}
          </p>
          {status === "error" && (
            <>
              <p className="max-w-[280px] text-[14px] leading-5 text-ink-2">
                The figure could not be loaded. The dial below still works.
              </p>
              <button
                type="button"
                onClick={() => sceneRef.current?.reload()}
                className="pointer-events-auto flex items-center gap-2 rounded-[10px] border border-line-strong px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-brand-text hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {ready && (
        <>
          <button
            type="button"
            aria-label="Turn the figure left"
            onClick={() => turn(-1)}
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface/85 text-ink-2 backdrop-blur-sm transition-colors hover:border-brand-text hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:left-3"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="Turn the figure right"
            onClick={() => turn(1)}
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface/85 text-ink-2 backdrop-blur-sm transition-colors hover:border-brand-text hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:right-3"
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
        </>
      )}
    </div>
  );
}

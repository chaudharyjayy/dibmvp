"use client";

/**
 * The simulator's time dial.
 *
 * It drives the same simulated series the figure is drawn from, so the
 * numbers on screen and the shading on the body are the same moment. It runs
 * over the simulated window, not a fixed twelve hours: the window is the
 * user's choice, and the peak may sit anywhere inside it.
 *
 * The strip is a real slider: it takes focus, it answers the arrow keys, and
 * it reads out the hour.
 *
 * The handle is placed with a transform rather than `left`. `left` is a
 * layout property, so moving it every frame forces the browser to lay the
 * strip out again; a transform is composited. It also means the handle can
 * be transitioned, which `left` cannot be without the same cost.
 */

import { useCallback, useEffect, useRef } from "react";

export type DialSource = "user" | "auto";

export type TimeDialProps = {
  /** The simulated window, in hours. */
  maxH: number;
  /** The current hour. */
  hours: number;
  /**
   * Moves the dial. The source says whether the visitor moved it or the
   * play loop did, so the readouts can react to the visitor and stay still
   * under the loop — sixteen updates a second is a strobe.
   */
  onHours: (hours: number, source: DialSource) => void;
  /** When the visitor presses play, the dial advances on its own. */
  playing?: boolean;
  onTogglePlay?: () => void;
  /** The time of the peak, marked on the track. */
  tmaxH?: number | null;
};

const GUTTER = 14;

function clamp(hours: number, maxH: number): number {
  if (!Number.isFinite(hours)) return 0;
  return hours < 0 ? 0 : hours > maxH ? maxH : hours;
}

export default function TimeDial({
  maxH,
  hours,
  onHours,
  playing = false,
  onTogglePlay,
  tmaxH,
}: TimeDialProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLSpanElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  /** True while the pointer is down: the handle tracks it exactly. */
  const draggingRef = useRef(false);

  const paint = useCallback(
    (next: number) => {
      const fraction = maxH > 0 ? next / maxH : 0;
      if (fillRef.current) fillRef.current.style.width = `${(fraction * 100).toFixed(2)}%`;
      if (handleRef.current) {
        // A unitless fraction, so the CSS can place it. The strip is a
        // container, so the handle's position is a share of the strip's
        // width rather than a pixel value JavaScript has to keep in step
        // with the layout.
        handleRef.current.style.setProperty("--dial-x", fraction.toFixed(5));
      }
      if (readoutRef.current) readoutRef.current.textContent = `${next.toFixed(1)} h`;
      const strip = stripRef.current;
      if (strip) {
        strip.setAttribute("aria-valuenow", next.toFixed(2));
        strip.setAttribute("aria-valuetext", `${next.toFixed(1)} hours`);
        strip.dataset.dialValue = next.toFixed(2);
      }
    },
    [maxH]
  );

  useEffect(() => {
    paint(hours);
  }, [hours, paint]);

  const hoursFromPointer = useCallback(
    (clientX: number) => {
      const strip = stripRef.current;
      if (!strip) return 0;
      const rect = strip.getBoundingClientRect();
      const usable = Math.max(1, rect.width - GUTTER * 2);
      return clamp(((clientX - rect.left - GUTTER) / usable) * maxH, maxH);
    },
    [maxH]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      draggingRef.current = true;
      event.currentTarget.dataset.dragging = "true";
      onHours(hoursFromPointer(event.clientX), "user");
    },
    [hoursFromPointer, onHours]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onHours(hoursFromPointer(event.clientX), "user");
    },
    [hoursFromPointer, onHours]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = maxH > 48 ? 1 : maxH > 12 ? 0.5 : 0.25;
      let next: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = hours - step;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = hours + step;
      else if (event.key === "PageDown") next = hours - step * 4;
      else if (event.key === "PageUp") next = hours + step * 4;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = maxH;
      if (next === null) return;
      event.preventDefault();
      onHours(clamp(next, maxH), "user");
    },
    [hours, maxH, onHours]
  );

  const peakPercent = tmaxH != null && maxH > 0 ? (tmaxH / maxH) * 100 : null;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
        <span>0 h</span>
        {onTogglePlay ? (
          <button
            type="button"
            onClick={onTogglePlay}
            aria-pressed={playing}
            className="group relative rounded border border-line px-2 py-0.5 text-ink-2 transition-colors duration-150 hover:border-brand hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-95 motion-reduce:transition-none motion-reduce:transform-none"
          >
            {/* Both glyphs are always in the DOM and cross-fade, rather than
                one being swapped for the other. aria-pressed carries the
                state, not the picture. */}
            <span
              aria-hidden="true"
              className={`transition-opacity duration-150 motion-reduce:transition-none ${
                playing ? "opacity-0" : "opacity-100"
              }`}
            >
              ▶ play
            </span>
            <span
              aria-hidden="true"
              className={`absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none ${
                playing ? "opacity-100" : "opacity-0"
              }`}
            >
              ❚❚ pause
            </span>
          </button>
        ) : null}
        <span ref={readoutRef} className="tabular-nums text-brand-text">
          {hours.toFixed(1)} h
        </span>
        <span>{maxH} h</span>
      </div>

      <div
        ref={stripRef}
        data-dial-strip
        role="slider"
        tabIndex={0}
        aria-label="Simulated time, in hours"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={maxH}
        aria-valuenow={0}
        aria-valuetext="0.0 hours"
        data-dial-value="0.00"
        className="relative mt-2 h-11 w-full cursor-ew-resize touch-pan-y select-none rounded-xl border border-line bg-surface/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        style={{ containerType: "inline-size" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {/* The peak of the curve, marked on the track. The hour is also given
            in text: a marker alone says nothing to a screen reader. */}
        {peakPercent != null ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-brand-text/60"
            style={{ left: `calc(${GUTTER}px + (100% - ${GUTTER * 2}px) * ${peakPercent / 100})` }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-[14px] top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-strong">
          <div
            ref={fillRef}
            className="h-full rounded-full bg-brand"
            style={{ width: "0%" }}
          />
        </div>
        <span
          ref={handleRef}
          aria-hidden="true"
          className="sim-handle pointer-events-none absolute top-1/2 h-4 w-4 rounded-full border-2 border-brand bg-ink"
          style={{ left: `${GUTTER}px` }}
        />
      </div>

      {peakPercent != null && tmaxH != null ? (
        <p className="sr-only">The peak of the curve is at {tmaxH.toFixed(2)} hours.</p>
      ) : null}
    </div>
  );
}

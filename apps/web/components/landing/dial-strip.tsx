"use client";

/**
 * The time dial: a sparkline of the illustrative shape (72px from md up, 56px
 * on mobile) and a strip the visitor drags (or arrows through) to move time
 * from 0 to 12 hours. The mobile strip is 44px tall — the spec's tap target —
 * and 56px on desktop.
 *
 * It owns the hour value and reports it upward with `onTime`; the figure scene
 * tints organs and releases particles from the same curve in `dial.ts`. The
 * autoplay (0 → 6 h over 4 s, starting at 1 s) is cancelled by any touch,
 * scroll or key, so the first thing the visitor does is theirs.
 *
 * Painting is ref-based: a 60fps React re-render for a moving handle would be
 * waste, so the DOM attributes are written directly and only the readout text
 * changes per frame.
 */

import { useCallback, useEffect, useRef } from "react";
import { DIAL_HOURS, curve } from "./dial";
import { EASE_IN_OUT } from "./easing";
import { LOAD, riseStyle } from "./load";

export type DialHandle = {
  /** Move the dial to an hour without reporting it back through onTime. */
  setTime(hours: number): void;
};

type DialStripProps = {
  onTime?: (hours: number) => void;
  /** Receives an imperative handle, for the scroll sequence in step 4. */
  onReady?: (handle: DialHandle) => void;
  /**
   * Demo sweep 0 → 6 h on mount. Off inside the pinned hero: the scroll
   * sequence owns the dial there, and two owners would fight per frame.
   */
  autoplay?: boolean;
};

const SPARK_W = 560;
/** Height of the curve area inside the 72px sparkline block. */
const SPARK_H = 46;
const SPARK_SAMPLES = 120;
const GUTTER = 16; // px inset of the draggable track
const AUTOPLAY_TO = 6; // hours
const AUTOPLAY_DELAY = 1000; // ms
const AUTOPLAY_MS = 4000;

/** The illustrative curve, drawn once as an SVG path. */
const SPARK_PATH = (() => {
  let d = "";
  for (let i = 0; i <= SPARK_SAMPLES; i += 1) {
    const x = (i / SPARK_SAMPLES) * SPARK_W;
    const y = SPARK_H - 2 - curve((i / SPARK_SAMPLES) * DIAL_HOURS) * (SPARK_H - 4);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
})();

const SPARK_FILL = `${SPARK_PATH} L${SPARK_W} ${SPARK_H} L0 ${SPARK_H} Z`;

function clampHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return hours < 0 ? 0 : hours > DIAL_HOURS ? DIAL_HOURS : hours;
}

export default function DialStrip({ onTime, onReady, autoplay = true }: DialStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLSpanElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const playheadRef = useRef<SVGLineElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);

  const hoursRef = useRef(0);
  const draggingRef = useRef(false);
  const onTimeRef = useRef(onTime);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onTimeRef.current = onTime;
    onReadyRef.current = onReady;
  }, [onTime, onReady]);

  const paint = useCallback((hours: number) => {
    const fraction = hours / DIAL_HOURS;
    if (fillRef.current) fillRef.current.style.width = `${(fraction * 100).toFixed(2)}%`;
    if (handleRef.current) {
      handleRef.current.style.left = `calc(${GUTTER}px + (100% - ${GUTTER * 2}px) * ${fraction})`;
    }
    if (readoutRef.current) readoutRef.current.textContent = `${hours.toFixed(1)} h`;

    const x = fraction * SPARK_W;
    const y = SPARK_H - 2 - curve(hours) * (SPARK_H - 4);
    if (playheadRef.current) {
      playheadRef.current.setAttribute("x1", x.toFixed(1));
      playheadRef.current.setAttribute("x2", x.toFixed(1));
    }
    if (dotRef.current) {
      dotRef.current.setAttribute("cx", x.toFixed(1));
      dotRef.current.setAttribute("cy", y.toFixed(1));
    }

    const strip = stripRef.current;
    if (strip) {
      strip.setAttribute("aria-valuenow", hours.toFixed(2));
      strip.setAttribute("aria-valuetext", `${hours.toFixed(1)} hours`);
      strip.dataset.dialValue = hours.toFixed(2);
    }
  }, []);

  const apply = useCallback(
    (hours: number, emit: boolean) => {
      const next = clampHours(hours);
      hoursRef.current = next;
      paint(next);
      if (emit) onTimeRef.current?.(next);
    },
    [paint]
  );

  // Initial paint plus the imperative handle the scroll sequence drives.
  useEffect(() => {
    apply(hoursRef.current, false);
    onReadyRef.current?.({
      setTime(hours: number) {
        apply(hours, false);
      },
    });
  }, [apply]);

  // Autoplay: 0 → 6 h over 4 s, one second after mount.
  useEffect(() => {
    if (!autoplay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let cancelled = false;
    const start = performance.now() + AUTOPLAY_DELAY;

    const tick = (now: number) => {
      if (cancelled) return;
      if (now < start) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(1, (now - start) / AUTOPLAY_MS);
      apply(AUTOPLAY_TO * EASE_IN_OUT(progress), true);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const stop = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("scroll", stop);
      window.removeEventListener("touchstart", stop);
    };
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", stop);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("scroll", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });

    return stop;
  }, [apply, autoplay]);

  const hoursFromPointer = useCallback((clientX: number) => {
    const strip = stripRef.current;
    if (!strip) return 0;
    const rect = strip.getBoundingClientRect();
    const usable = Math.max(1, rect.width - GUTTER * 2);
    return clampHours(((clientX - rect.left - GUTTER) / usable) * DIAL_HOURS);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      apply(hoursFromPointer(event.clientX), true);
    },
    [apply, hoursFromPointer]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      apply(hoursFromPointer(event.clientX), true);
    },
    [apply, hoursFromPointer]
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = hoursRef.current;
      let next: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - 0.25;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + 0.25;
      else if (event.key === "PageDown") next = current - 1;
      else if (event.key === "PageUp") next = current + 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = DIAL_HOURS;
      if (next === null) return;
      event.preventDefault();
      apply(next, true);
    },
    [apply]
  );

  return (
    <div
      data-load="dial"
      className="landing-load mt-4 px-2 md:mt-6 md:max-w-[560px] md:px-0"
      style={riseStyle(LOAD.dial.delay, LOAD.dial.duration, LOAD.dial.y)}
    >
      <p id="dial-help" className="sr-only">
        Moves the illustrative drug level through twelve hours. Use the arrow keys for a quarter of
        an hour, Page Up and Page Down for an hour, and Home or End for either end. The same hours
        are what the figure and the graph show. While it has focus, scrolling the page stops moving
        it, so the hours you set stay put.
      </p>

      <div
        data-dial-sparkline
        className="relative h-[56px] w-full overflow-hidden rounded-t-[12px] border border-b-0 border-line bg-surface/80 px-3 md:h-[72px]"
      >
        <div className="absolute inset-x-3 top-1.5 flex items-baseline justify-between font-mono text-[12px] leading-4 tracking-[0.08em] text-ink-2">
          <span>0 h</span>
          <span ref={readoutRef} data-dial-readout aria-hidden="true">
            0.0 h
          </span>
          <span>{DIAL_HOURS} h</span>
        </div>
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-x-3 top-[20px] h-[32px] w-[calc(100%-1.5rem)] md:top-[22px] md:h-[46px]"
        >
          <path d={SPARK_FILL} fill="var(--accent-fill)" opacity="0.14" />
          <path
            d={SPARK_PATH}
            fill="none"
            stroke="var(--accent-fill)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            ref={playheadRef}
            x1="0"
            x2="0"
            y1="0"
            y2={SPARK_H}
            stroke="var(--line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <circle ref={dotRef} cx="0" cy="0" r="3" fill="var(--accent-fill)" />
        </svg>
      </div>

      <div
        ref={stripRef}
        data-dial-strip
        role="slider"
        tabIndex={0}
        aria-label="Illustrative time, in hours"
        aria-orientation="horizontal"
        aria-describedby="dial-help dial-note"
        aria-valuemin={0}
        aria-valuemax={DIAL_HOURS}
        aria-valuenow={0}
        aria-valuetext="0.0 hours"
        data-dial-value="0.00"
        /* pan-y, not none: a vertical swipe that starts on the strip must still
           scroll the page. The browser cancels the pointer stream when it takes
           over a vertical pan, so horizontal drags are unaffected. */
        className="relative h-11 w-full cursor-ew-resize touch-pan-y select-none rounded-b-[12px] border border-line bg-surface/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-14"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="pointer-events-none absolute inset-x-4 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line-strong">
          <div
            ref={fillRef}
            data-dial-fill
            className="h-full rounded-full bg-brand"
            style={{ width: "0%" }}
          />
        </div>
        <span
          ref={handleRef}
          data-dial-handle
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-ink shadow-[0_0_12px_rgba(34,211,238,0.65)]"
          style={{ left: `${GUTTER}px` }}
        />
      </div>

      <p
        id="dial-note"
        className="mt-3 font-mono text-[12px] leading-4 tracking-[0.08em] text-ink-2 md:mt-4"
      >
        Illustrative shape, not a real drug.
      </p>
    </div>
  );
}

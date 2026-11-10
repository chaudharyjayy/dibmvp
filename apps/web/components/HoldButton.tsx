"use client";

/** HoldButton — press and hold to trigger a single action.
 *
 *  Fills with `fillColor` over `holdTime` ms while the pointer (or Space/Enter)
 *  is held down. On completion it fires `onHold`, swaps the label to `doneLabel`,
 *  then resets after `resetAfter` ms. Releasing early decays the fill over
 *  `releaseTime` ms.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

export type HoldButtonSize = "sm" | "md" | "lg";
export type HoldButtonFillDirection = "left" | "right" | "top" | "bottom";

export interface HoldButtonProps {
  children: ReactNode;
  /** Label shown once the hold completes. */
  doneLabel?: string;
  /** Resting background of the button. */
  backgroundColor?: string;
  /** Colour that sweeps in as the hold progresses. */
  fillColor?: string;
  /** Label colour while un-filled. */
  textColor?: string;
  /** Label colour once the fill reaches it. */
  fillTextColor?: string;
  size?: HoldButtonSize;
  /** Corner radius in pixels. */
  radius?: number;
  fillDirection?: HoldButtonFillDirection;
  /** Milliseconds of continuous press required to trigger. */
  holdTime?: number;
  /** Milliseconds the fill takes to drain after an early release. */
  releaseTime?: number;
  /** Scale applied while pressed. */
  pressScale?: number;
  /** Swell the button vertically as the hold progresses. */
  wave?: boolean;
  /** Peak swell in pixels when `wave` is enabled. */
  waveAmplitude?: number;
  /** Emit a coloured glow that grows with the fill. */
  glow?: boolean;
  /** Milliseconds to remain in the done state before resetting. */
  resetAfter?: number;
  onHold?: () => void;
  className?: string;
  disabled?: boolean;
}

const SIZE_STYLES: Record<HoldButtonSize, CSSProperties> = {
  sm: { height: 34, paddingInline: 14, fontSize: 12 },
  md: { height: 44, paddingInline: 18, fontSize: 13 },
  lg: { height: 54, paddingInline: 24, fontSize: 15 },
};

const ORIGINS: Record<HoldButtonFillDirection, string> = {
  left: "right center",
  right: "left center",
  top: "center bottom",
  bottom: "center top",
};

/** Applies alpha to a hex colour; falls back to the raw colour for other formats. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    const [, r, g, b] = short;
    return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`;
  }
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (full) {
    const [, r, g, b] = full;
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  }
  return hex;
}

/** Clip path revealing the fill-coloured copy of the label. */
function labelClip(direction: HoldButtonFillDirection, progress: number): string {
  const remaining = (1 - progress) * 100;
  switch (direction) {
    case "left":
      return `inset(0 0 0 ${remaining}%)`;
    case "top":
      return `inset(${remaining}% 0 0 0)`;
    case "bottom":
      return `inset(0 0 ${remaining}% 0)`;
    case "right":
    default:
      return `inset(0 ${remaining}% 0 0)`;
  }
}

function fillTransform(direction: HoldButtonFillDirection, progress: number): string {
  switch (direction) {
    case "left":
    case "right":
      return `scaleX(${progress})`;
    case "top":
    case "bottom":
    default:
      return `scaleY(${progress})`;
  }
}

export function HoldButton({
  children,
  doneLabel,
  backgroundColor = "#18181b",
  fillColor = "#ef4444",
  textColor = "#fafafa",
  fillTextColor = "#ffffff",
  size = "md",
  radius = 14,
  fillDirection = "right",
  holdTime = 1400,
  releaseTime = 240,
  pressScale = 0.97,
  wave = false,
  waveAmplitude = 6,
  glow = false,
  resetAfter = 1200,
  onHold,
  className = "",
  disabled = false,
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [done, setDone] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const progressRef = useRef(0);
  const doneRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const stopFrames = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const setProgressBoth = useCallback((value: number) => {
    progressRef.current = value;
    setProgress(value);
  }, []);

  const complete = useCallback(() => {
    stopFrames();
    doneRef.current = true;
    setProgressBoth(1);
    setPressed(false);
    setDone(true);
    onHold?.();

    clearResetTimer();
    resetTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      doneRef.current = false;
      setDone(false);
      setProgressBoth(0);
      setPressed(false);
    }, resetAfter);
  }, [clearResetTimer, onHold, resetAfter, setProgressBoth, stopFrames]);

  const tick = useCallback(
    (now: number) => {
      if (doneRef.current) return;
      const elapsed = now - startRef.current;
      const next = holdTime <= 0 ? 1 : Math.min(1, elapsed / holdTime);
      setProgressBoth(next);
      if (next >= 1) {
        complete();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    },
    [complete, holdTime, setProgressBoth],
  );

  const beginHold = useCallback(() => {
    if (disabled || doneRef.current) return;
    clearResetTimer();
    stopFrames();
    setPressed(true);
    startRef.current = performance.now() - progressRef.current * holdTime;
    frameRef.current = requestAnimationFrame(tick);
  }, [clearResetTimer, disabled, holdTime, stopFrames, tick]);

  const endHold = useCallback(() => {
    if (doneRef.current) {
      setPressed(false);
      return;
    }
    setPressed(false);
    stopFrames();
    if (releaseTime <= 0) {
      setProgressBoth(0);
      return;
    }
    const from = progressRef.current;
    const releasedAt = performance.now();
    const drain = (now: number) => {
      const t = Math.min(1, (now - releasedAt) / releaseTime);
      setProgressBoth(from * (1 - t));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(drain);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(drain);
  }, [releaseTime, setProgressBoth, stopFrames]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      beginHold();
    },
    [beginHold],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endHold();
    },
    [endHold],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      beginHold();
    },
    [beginHold],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      endHold();
    },
    [endHold],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopFrames();
      clearResetTimer();
    };
  }, [clearResetTimer, stopFrames]);

  const label = done && doneLabel ? doneLabel : children;
  const swell = wave ? Math.sin(progress * Math.PI) * waveAmplitude : 0;
  const scale = pressed ? pressScale : 1;
  const glowRadius = glow ? 6 + progress * 26 : 0;

  const baseStyle: CSSProperties = {
    ...SIZE_STYLES[size],
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius,
    border: "none",
    background: backgroundColor,
    color: textColor,
    fontFamily: "inherit",
    fontWeight: 500,
    letterSpacing: "0.01em",
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    userSelect: "none",
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
    transform: `translateY(${-swell}px) scale(${scale})`,
    boxShadow: glow
      ? `0 0 ${glowRadius}px ${withAlpha(fillColor, 0.35 + progress * 0.35)}`
      : "none",
    transition: pressed
      ? "transform 120ms ease-out, box-shadow 120ms linear"
      : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease-out",
  };

  const fillStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: fillColor,
    transformOrigin: ORIGINS[fillDirection],
    transform: fillTransform(fillDirection, progress),
    pointerEvents: "none",
  };

  const labelStyle: CSSProperties = {
    position: "relative",
    zIndex: 2,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const fillLabelStyle: CSSProperties = {
    ...labelStyle,
    position: "absolute",
    inset: 0,
    zIndex: 3,
    justifyContent: "center",
    color: fillTextColor,
    clipPath: labelClip(fillDirection, progress),
    pointerEvents: "none",
  };

  return (
    <button
      type="button"
      className={className}
      style={baseStyle}
      disabled={disabled}
      aria-pressed={done}
      aria-label={typeof children === "string" ? children : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={(event) => {
        if (event.buttons === 0) endHold();
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={endHold}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span style={fillStyle} aria-hidden />
      <span style={labelStyle}>{label}</span>
      <span style={fillLabelStyle} aria-hidden>
        {label}
      </span>
    </button>
  );
}

export default HoldButton;

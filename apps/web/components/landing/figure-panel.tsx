"use client";

/**
 * The figure column: the canvas holding the glass figure, and under it the
 * dial strip, labelled as illustrative.
 *
 * Sizing follows the spec except where its own numbers cannot fit: at
 * 1440×900 the chrome (72px header + 40px disclaimer) plus a fixed 700px
 * canvas and the 128px dial leaves nothing on screen, so the desktop canvas
 * is clamped to the viewport between 400 and 700px. On mobile the canvas is
 * full-bleed and at least 50svh.
 *
 * The panel is the only place that knows both halves: it holds the scene
 * handle and the last dial hour, so a dial move that lands before the lazily
 * imported scene is ready is replayed rather than lost.
 */

import { useCallback, useRef } from "react";
import DialStrip, { type DialHandle } from "./dial-strip";
import GlassFigure from "./glass-figure";
import type { FigureScene } from "./figure-scene";

export default function FigurePanel({ className = "" }: { className?: string }) {
  const sceneRef = useRef<FigureScene | null>(null);
  const timeRef = useRef(0);
  // Used by the scroll sequence (step 4) to drive the dial.
  const dialRef = useRef<DialHandle | null>(null);

  const handleScene = useCallback((scene: FigureScene | null) => {
    sceneRef.current = scene;
    if (scene) scene.setTime(timeRef.current);
  }, []);

  const handleTime = useCallback((hours: number) => {
    timeRef.current = hours;
    sceneRef.current?.setTime(hours);
  }, []);

  const handleDialReady = useCallback((handle: DialHandle) => {
    dialRef.current = handle;
    // Text measurement hook: the same handle the scroll sequence will drive.
    (window as Window & { __dibDial?: DialHandle }).__dibDial = handle;
  }, []);

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full md:ml-auto md:max-w-[672px]">
        <div
          data-figure-canvas
          className="relative h-[max(420px,50svh)] w-full overflow-hidden bg-page md:h-[clamp(400px,calc(100svh-330px),700px)] md:rounded-[12px]"
        >
          <GlassFigure onScene={handleScene} />
        </div>

        <DialStrip onTime={handleTime} onReady={handleDialReady} />
      </div>
    </div>
  );
}

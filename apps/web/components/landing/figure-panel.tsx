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

import { useCallback, useEffect, useRef, useState } from "react";
import DialStrip, { type DialHandle } from "./dial-strip";
import GlassFigure from "./glass-figure";
import Reticle from "./reticle";
import type { FigureScene } from "./figure-scene";

type FigurePanelProps = {
  className?: string;
  /** Hands the live scene to the scroll sequence. */
  onScene?: (scene: FigureScene | null) => void;
  /** Hands the dial's imperative handle to the scroll sequence. */
  onDial?: (handle: DialHandle | null) => void;
  /** Off when a scroll sequence drives the dial (see DialStrip). */
  autoplay?: boolean;
};

export default function FigurePanel({
  className = "",
  onScene,
  onDial,
  autoplay = true,
}: FigurePanelProps) {
  const sceneRef = useRef<FigureScene | null>(null);
  const timeRef = useRef(0);
  // Used by the scroll sequence (step 4) to drive the dial.
  const dialRef = useRef<DialHandle | null>(null);
  const onSceneRef = useRef(onScene);
  const onDialRef = useRef(onDial);
  /** The live scene, for the reticle. */
  const [scene, setScene] = useState<FigureScene | null>(null);

  useEffect(() => {
    onSceneRef.current = onScene;
    onDialRef.current = onDial;
  }, [onScene, onDial]);

  const handleScene = useCallback((scene: FigureScene | null) => {
    sceneRef.current = scene;
    if (scene) scene.setTime(timeRef.current);
    setScene(scene);
    onSceneRef.current?.(scene);
  }, []);

  const handleTime = useCallback((hours: number) => {
    timeRef.current = hours;
    sceneRef.current?.setTime(hours);
  }, []);

  const handleDialReady = useCallback((handle: DialHandle) => {
    dialRef.current = handle;
    // Text measurement hook: the same handle the scroll sequence will drive.
    (window as Window & { __dibDial?: DialHandle }).__dibDial = handle;
    onDialRef.current?.(handle);
  }, []);

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full md:ml-auto md:max-w-[672px]">
        <div
          data-figure-canvas
          className="hud-corners relative h-[max(420px,50svh)] w-full overflow-hidden bg-page/40 md:h-[clamp(400px,calc(100svh-330px),700px)] md:rounded-[12px]"
        >
          <GlassFigure onScene={handleScene} />
          {/* The scanner sweep: the one piece of theatre on the page, and the
              thing that makes the figure read as a hologram. */}
          <div className="hud-scan" aria-hidden="true" />
          {/* The reticle locks onto the organ holding the highest level. */}
          <Reticle scene={scene} />
        </div>

        <DialStrip onTime={handleTime} onReady={handleDialReady} autoplay={autoplay} />
      </div>
    </div>
  );
}

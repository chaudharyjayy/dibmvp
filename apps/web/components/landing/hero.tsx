"use client";

/**
 * The pinned hero: one sticky 100svh stage inside a 400svh wrapper (280svh on
 * mobile), so the page scrolls natively and the figure stays put while the
 * story plays over it.
 *
 * Progress is read from the wrapper's own rect, never from a scroll hijack.
 * Over the first 8% the copy fades out and the figure slides to the centre and
 * scales to 1.12. Then three phases drive the dial, the camera and the
 * particles: 0.08–0.36 absorption, 0.36–0.64 distribution, 0.64–0.92
 * elimination. Past 0.92 the dial is the visitor's again and the closing call
 * to action fades in.
 *
 * All per-frame values are written straight to refs (style, scene, dial) so
 * scrolling at 60fps never triggers a React render; only the phase index and
 * the end state are React state, because they toggle CSS transitions.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DialHandle } from "./dial-strip";
import { DIAL_HOURS } from "./dial";
import { EASE_OUT } from "./easing";
import FigurePanel from "./figure-panel";
import type { FigureScene } from "./figure-scene";
import {
  P_ELIMINATE_END,
  P_FADE_END,
  clamp01,
  dialTarget,
  endAt,
  glowTarget,
  orbitTarget,
  phaseAt,
  zoomTarget,
} from "./scroll";
import { type } from "./type";

const H1_LINES = ["See how a drug", "moves through a body,", "hour by hour."];

const PHASES = [
  {
    number: "01",
    title: "Absorption",
    body: "The dose leaves the gut and reaches the blood.",
  },
  {
    number: "02",
    title: "Distribution",
    body: "The illustrative level spreads through the circulation.",
  },
  {
    number: "03",
    title: "Elimination",
    body: "The level falls as the body clears it.",
  },
] as const;

export default function Hero() {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const figureRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef<HTMLElement | null>(null);

  const sceneRef = useRef<FigureScene | null>(null);
  const dialRef = useRef<DialHandle | null>(null);
  /** Translation that puts the figure column at the centre of the stage. */
  const geomRef = useRef({ dx: 0, dy: 0 });

  const [phase, setPhase] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const phaseRef = useRef(0);
  const endRef = useRef(false);

  const handleScene = useCallback((scene: FigureScene | null) => {
    sceneRef.current = scene;
    scaleRef.current = figureRef.current?.querySelector<HTMLElement>("[data-figure-canvas]") ?? null;
  }, []);

  const handleDial = useCallback((handle: DialHandle | null) => {
    dialRef.current = handle;
  }, []);

  /* Centre translation: recomputed when either the stage or the column
     changes size (font load, rotation, dial label wrapping). */
  useEffect(() => {
    const stage = stageRef.current;
    const layer = figureRef.current;
    if (!stage || !layer) return;

    const measure = () => {
      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;
      const layerW = layer.offsetWidth;
      const layerH = layer.offsetHeight;
      geomRef.current = {
        dx: (stageW - layerW) / 2 - layer.offsetLeft,
        dy: (stageH - layerH) / 2 - layer.offsetTop,
      };
    };

    measure();
    scaleRef.current = layer.querySelector<HTMLElement>("[data-figure-canvas]");

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(layer);
    void document.fonts?.ready.then(measure);

    return () => observer.disconnect();
  }, []);

  /* Scroll loop. Reads the wrapper rect, writes styles and scene state. */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dialValue = 0;
    let glow = 0;
    let unlocked = false;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const wrapper = wrapperRef.current;
      const stage = stageRef.current;
      if (!wrapper || !stage) return;

      const rect = wrapper.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;

      const span = wrapper.offsetHeight - stage.offsetHeight;
      const p = span > 0 ? clamp01(-rect.top / span) : 0;

      /* Copy fades, figure slides to centre and scales up. */
      const fade = clamp01(p / P_FADE_END);
      if (textRef.current) {
        textRef.current.style.opacity = String(1 - fade);
        textRef.current.style.transform = `translate3d(0, ${(-24 * fade).toFixed(2)}px, 0)`;
        // Once it is invisible it must also be unclickable and unreachable by
        // Tab; inert does both without a second disabled state to keep in sync.
        textRef.current.inert = fade > 0.5;
      }

      const slide = EASE_OUT(fade);
      if (figureRef.current) {
        const { dx, dy } = geomRef.current;
        figureRef.current.style.transform = `translate3d(${(dx * slide).toFixed(1)}px, ${(
          dy * slide
        ).toFixed(1)}px, 0)`;
      }
      if (scaleRef.current) {
        scaleRef.current.style.transform = `scale(${(1 + 0.12 * slide).toFixed(3)})`;
      }

      /* Camera and particles follow the same progress. */
      sceneRef.current?.setOrbit(orbitTarget(p));
      sceneRef.current?.setZoom(zoomTarget(p));
      const glowGoal = glowTarget(p);
      glow += (glowGoal - glow) * (reduced.matches ? 1 : 0.12);
      sceneRef.current?.setGlow(glow);

      /* Dial: scroll owns it until the last phase ends, then it is the
         visitor's again (drag and keys work without a fight from scroll). */
      if (p >= P_ELIMINATE_END) {
        if (!unlocked) {
          unlocked = true;
          dialValue = DIAL_HOURS;
          dialRef.current?.setTime(DIAL_HOURS);
          sceneRef.current?.setTime(DIAL_HOURS);
        }
      } else {
        unlocked = false;
        const goal = dialTarget(p);
        dialValue += (goal - dialValue) * (reduced.matches ? 1 : 0.12);
        dialRef.current?.setTime(dialValue);
        sceneRef.current?.setTime(dialValue);
      }

      /* Phase captions and the closing call to action. */
      const nextPhase = phaseAt(p, phaseRef.current);
      if (nextPhase !== phaseRef.current) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      }
      const nextEnd = endAt(p, endRef.current);
      if (nextEnd !== endRef.current) {
        endRef.current = nextEnd;
        setAtEnd(nextEnd);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      ref={wrapperRef}
      data-scroll-wrapper
      className="relative w-full bg-page h-[280svh] md:h-[400svh]"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-page">
        <div ref={stageRef} className="relative mx-auto h-full w-full max-w-[1440px]">
          <div
            ref={textRef}
            data-hero-text
            className="absolute left-5 right-5 top-[88px] md:left-12 md:right-auto md:top-24 md:w-[592px] will-change-transform"
          >
            <p className={`text-ink-2 ${type.caption}`}>Educational simulator</p>

            <h1 className={`mt-6 text-ink ${type.display}`}>
              {H1_LINES.map((line, index) => (
                <span key={line} data-h1-line={index} className="block">
                  {line}
                  {index < H1_LINES.length - 1 ? " " : ""}
                </span>
              ))}
            </h1>

            <p className={`mt-6 max-w-[480px] text-ink-2 ${type.body}`}>
              Set a profile and a dose, then move the time dial to watch an illustrative drug
              level rise and fall.
            </p>

            <div className="mt-8 flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8">
              <Link
                href="/simulator"
                className="flex h-[52px] w-full items-center justify-center rounded-[10px] bg-ink px-6 text-[15px] font-medium text-white outline-none transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-12 md:w-auto"
              >
                Try the simulator
              </Link>

              <Link
                href="/how-it-works"
                className="rounded-[10px] text-[15px] font-medium text-ink-2 outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                How does this work <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div
            ref={figureRef}
            data-hero-figure
            className="absolute left-0 right-0 top-[calc(100svh-324px)] md:left-auto md:right-12 md:top-24 md:w-[672px] will-change-transform"
          >
            <FigurePanel onScene={handleScene} onDial={handleDial} autoplay={false} />
          </div>

          <div className="pointer-events-none absolute bottom-24 left-5 right-5 md:bottom-28 md:left-12 md:right-auto md:w-[592px]">
            <div className="relative h-[150px] md:h-[178px]">
              {PHASES.map((item, index) => {
                const active = phase === index + 1 && !atEnd;
                return (
                  <div
                    key={item.number}
                    data-phase-caption={index + 1}
                    aria-hidden={!active}
                    className={`absolute inset-x-0 bottom-0 transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                    }`}
                  >
                    <p className={`text-ink-2 ${type.caption}`}>{item.number}</p>
                    <h2 className={`mt-3 text-ink ${type.h2}`}>{item.title}</h2>
                    <p className={`mt-3 max-w-[420px] text-ink-2 ${type.body}`}>{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            data-hero-end
            aria-hidden={!atEnd}
            className={`absolute bottom-24 left-5 right-5 transition-opacity duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:bottom-28 md:left-12 md:right-auto ${
              atEnd ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <p className={`text-ink-2 ${type.caption}`}>Ready when you are</p>
            <div className="mt-4 flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8">
              <Link
                href="/simulator"
                tabIndex={atEnd ? 0 : -1}
                className="flex h-[52px] w-full items-center justify-center rounded-[10px] bg-ink px-6 text-[15px] font-medium text-white outline-none transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-12 md:w-auto"
              >
                Try the simulator
              </Link>
              <Link
                href="/how-it-works"
                tabIndex={atEnd ? 0 : -1}
                className="rounded-[10px] text-[15px] font-medium text-ink-2 outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                How does this work <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

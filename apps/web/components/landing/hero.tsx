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
 * Mobile differs in one structural way: the copy sits in normal flow above the
 * pinned stage instead of on top of it. At 390×844 the copy (≈390px) plus a
 * 422px canvas plus the dial cannot share one screen, and paying for it by
 * cutting the figure in half also left the phase captions on top of the dial
 * strip. In flow, the copy is the first screen, the pin starts with the figure
 * already centred, and the captions have the space below the dial to
 * themselves.
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
import HudReadout from "./hud-readout";
import type { FigureScene } from "./figure-scene";
import { LOAD, h1Style, riseStyle } from "./load";
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

/** Above this width the copy overlays the stage and the figure slides in. */
const DESKTOP = "(min-width: 768px)";

export default function Hero() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const figureRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef<HTMLElement | null>(null);
  /** True below 768px: the figure is already centred, so it must not slide. */
  const compactRef = useRef(false);

  const sceneRef = useRef<FigureScene | null>(null);
  const dialRef = useRef<DialHandle | null>(null);
  /** Translation that puts the figure column at the centre of the stage. */
  const geomRef = useRef({ dx: 0, dy: 0 });

  const [phase, setPhase] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  /** The live scene, for the side readout. */
  const [scene, setScene] = useState<FigureScene | null>(null);
  const phaseRef = useRef(0);
  const endRef = useRef(false);

  /** What the polite live region announces; null outside the pinned phases. */
  const announcement = phase > 0 && phase <= PHASES.length ? PHASES[phase - 1] : null;

  const handleScene = useCallback((scene: FigureScene | null) => {
    sceneRef.current = scene;
    scaleRef.current =
      figureRef.current?.querySelector<HTMLElement>("[data-figure-canvas]") ?? null;
    setScene(scene ?? null);
  }, []);

  const handleDial = useCallback((handle: DialHandle | null) => {
    dialRef.current = handle;
  }, []);

  /* Centre translation: recomputed when either the stage or the column
     changes size (font load, rotation, dial label wrapping), and when the
     desktop/mobile breakpoint is crossed. */
  useEffect(() => {
    const stage = stageRef.current;
    const layer = figureRef.current;
    if (!stage || !layer) return;

    const measure = () => {
      const wide = window.matchMedia(DESKTOP).matches;
      compactRef.current = !wide;
      const threeCol = window.matchMedia("(min-width: 1280px)").matches;
      geomRef.current =
        wide && !threeCol
          ? {
              dx: (stage.clientWidth - layer.offsetWidth) / 2 - layer.offsetLeft,
              dy: (stage.clientHeight - layer.offsetHeight) / 2 - layer.offsetTop,
            }
          : // Already centred; a slide would wander across the panels.
            { dx: 0, dy: 0 };
    };

    measure();
    scaleRef.current = layer.querySelector<HTMLElement>("[data-figure-canvas]");

    const query = window.matchMedia(DESKTOP);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(layer);
    query.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);

    return () => {
      observer.disconnect();
      query.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  /* Scroll loop. Reads the wrapper rect, writes styles and scene state. */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dialValue = 0;
    let glow = 0;
    let unlocked = false;
    let lastTransform = "";
    let raf = 0;

    /* Who owns the dial. Scroll moves it during the pin, but the moment the
       visitor takes it — Tab or a tap puts focus on the strip, a drag or an
       arrow key changes it — writing scroll's hour over theirs would make the
       control look broken. They keep it until focus or the next tap goes
       somewhere else. */
    const onStrip = (node: EventTarget | null) =>
      node instanceof Element && Boolean(node.closest("[data-dial-strip]"));
    let dialHeld = false;
    const takeDial = (event: Event) => {
      if (onStrip(event.target)) dialHeld = true;
    };
    const releaseDial = (event: Event) => {
      if (!onStrip(event.target)) dialHeld = false;
    };
    const leaveDial = (event: Event) => {
      if (onStrip(event.target)) dialHeld = false;
    };
    document.addEventListener("focusin", takeDial, true);
    document.addEventListener("focusin", releaseDial, true);
    document.addEventListener("focusout", leaveDial, true);
    document.addEventListener("keydown", takeDial, true);
    document.addEventListener("pointerdown", releaseDial, true);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const wrapper = wrapperRef.current;
      const stage = stageRef.current;
      if (!wrapper || !stage) return;

      const rect = wrapper.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;

      const span = wrapper.offsetHeight - stage.offsetHeight;
      const p = span > 0 ? clamp01(-rect.top / span) : 0;

      /* Copy fades, figure slides to centre and scales up. Under reduced motion
         the fade stays (it is not movement) and everything else holds still:
         the lift, the slide and the scale are decorative parallax. */
      const still = reduced.matches;
      const fade = clamp01(p / P_FADE_END);
      /* Both copies fade: the flow copy shows below xl, the panel at xl.
         Only one is visible at a time. */
      for (const node of [textRef.current, panelRef.current]) {
        if (!node) continue;
        node.style.opacity = String(1 - fade);
        node.style.transform = `translate3d(0, ${
          still ? 0 : (-24 * fade).toFixed(2)
        }px, 0)`;
        // Once it is invisible it must also be unclickable and unreachable by
        // Tab; inert does both without a second disabled state to keep in sync.
        node.inert = fade > 0.5;
      }

      const slide = still ? 0 : EASE_OUT(fade);
      if (scaleRef.current) {
        /* Only the canvas slides and grows. The dial is a control: moving it
           mid-scroll drags it out from under the pointer, and on desktop it
           slid across the phase caption. The camera zoom still moves the
           figure in. */
        const { dx, dy } = geomRef.current;
        /* No CSS scale on mobile: growing a full-bleed canvas pushes its bottom
           under the dial strip. The camera zoom still moves the figure in. */
        const scale = compactRef.current || still ? 1 : 1 + 0.12 * slide;
        const transform = `translate3d(${(dx * slide).toFixed(1)}px, ${(dy * slide).toFixed(
          1
        )}px, 0) scale(${scale.toFixed(3)})`;
        if (transform !== lastTransform) {
          scaleRef.current.style.transform = transform;
          lastTransform = transform;
        }
      }

      /* Camera and particles follow the same progress. */
      sceneRef.current?.setOrbit(orbitTarget(p));
      sceneRef.current?.setZoom(zoomTarget(p));
      const glowGoal = glowTarget(p);
      glow += (glowGoal - glow) * (reduced.matches ? 1 : 0.12);
      sceneRef.current?.setGlow(glow);

      /* Dial: scroll owns it until the last phase ends, then it is the
         visitor's again (drag and keys work without a fight from scroll).
         While the strip itself holds focus the visitor owns it: a phone tap
         and a keyboard arrow both focus it, and writing scroll's value over
         theirs would make the control look broken. Scroll resumes on blur. */
      const active = document.activeElement;
      const held = dialHeld || (active instanceof Element && active.hasAttribute("data-dial-strip"));
      if (p >= P_ELIMINATE_END) {
        if (!unlocked) {
          unlocked = true;
          dialValue = DIAL_HOURS;
          if (!held) {
            dialRef.current?.setTime(DIAL_HOURS);
            sceneRef.current?.setTime(DIAL_HOURS);
          }
        }
      } else {
        unlocked = false;
        const goal = dialTarget(p);
        dialValue += (goal - dialValue) * (reduced.matches ? 1 : 0.12);
        if (!held) {
          dialRef.current?.setTime(dialValue);
          sceneRef.current?.setTime(dialValue);
        }
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
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("focusin", takeDial, true);
      document.removeEventListener("focusin", releaseDial, true);
      document.removeEventListener("focusout", leaveDial, true);
      document.removeEventListener("keydown", takeDial, true);
      document.removeEventListener("pointerdown", releaseDial, true);
    };
  }, []);

  return (
    <section className="relative w-full">
      <div className="relative mx-auto w-full max-w-[1440px]">
        <div
          ref={textRef}
          data-hero-text
          data-hero-copy="flow"
          className="relative z-10 px-5 pb-12 pt-[88px] will-change-transform md:absolute md:left-12 md:top-24 md:w-[min(592px,42vw)] md:px-0 md:pb-0 md:pt-0 xl:hidden"
        >
          <h1 className={`text-ink ${type.display}`}>
            {H1_LINES.map((line, index) => (
              <span
                key={line}
                data-h1-line={index}
                style={h1Style(index)}
                className="landing-load block"
              >
                {line}
                {index < H1_LINES.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>

          <p
            className={`landing-load mt-6 max-w-[480px] text-ink-2 md:max-w-[min(480px,42vw)] ${type.body}`}
            style={riseStyle(LOAD.body.delay, LOAD.body.duration, LOAD.body.y)}
          >
            Set a profile and a dose, then move the time dial to watch an illustrative drug level
            rise and fall.
          </p>

          <div
            className="landing-load mt-8 flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8"
            style={riseStyle(LOAD.actions.delay, LOAD.actions.duration, LOAD.actions.y)}
          >
            <Link
              href="/simulator"
              className="flex h-[52px] w-full items-center justify-center rounded-[10px] bg-brand px-6 text-[15px] font-semibold text-[#04121a] transition-colors hover:bg-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-12 md:w-auto"
            >
              Try the simulator
            </Link>

            <Link
              href="/how-it-works"
              className="inline-flex min-h-6 items-center rounded-[10px] text-[15px] font-medium text-ink-2 transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              How does this work <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div
          ref={wrapperRef}
          data-scroll-wrapper
          className="relative h-[280svh] w-full md:h-[400svh]"
        >
          {/* z-1 puts the stage under the HUD's texture layer (z-5) and under
              the copy (z-10): the grid draws across the stage, the headline
              stays clear of it. */}
          <div className="sticky top-0 z-[1] h-[100svh] w-full overflow-hidden">
            <div ref={stageRef} className="relative h-full w-full">
              {/* The stage behind the figure: an aura and an orbit ring, both
                  static art drawn in CSS, with the figure lit inside them. */}
              <div aria-hidden="true" className="absolute inset-0 hidden xl:block">
                <div className="hud-aura" />
                <div className="hud-orbit" />
              </div>

              {/* The left HUD column: the same words, framed as a console panel,
                  visible at xl only (unframed copy shows below xl). */}
              <div
                ref={panelRef}
                data-hero-text
                data-hero-copy="panel"
                className="absolute left-6 top-1/2 z-10 hidden w-[340px] -translate-y-1/2 will-change-transform xl:block"
              >
                <div className="hud-panel px-5 py-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                    DRUG-IN-BODY <span className="text-brand-text">// LAB-01</span>
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-text">Educational simulator</p>
                  <h1 className="mt-2 text-[36px] font-semibold leading-[40px] tracking-[-0.02em] text-ink">
                    {H1_LINES.map((line, index) => (
                      <span
                        key={line}
                        data-h1-line={index}
                        style={h1Style(index)}
                        className="landing-load block"
                      >
                        {line}
                        {index < H1_LINES.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </h1>
                  <p
                    className={`landing-load mt-4 text-[15px] leading-[22px] text-ink-2`}
                    style={riseStyle(LOAD.body.delay, LOAD.body.duration, LOAD.body.y)}
                  >
                    Set a profile and a dose, then move the time dial to watch an illustrative drug
                    level rise and fall.
                  </p>
                  <div
                    className="landing-load mt-5 flex flex-col items-start gap-4"
                    style={riseStyle(LOAD.actions.delay, LOAD.actions.duration, LOAD.actions.y)}
                  >
                    <Link
                      href="/simulator"
                      className="flex h-11 w-full items-center justify-center rounded-[10px] bg-brand px-4 text-[15px] font-semibold text-[#04121a] transition-colors hover:bg-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      Try the simulator
                    </Link>
                    <Link
                      href="/how-it-works"
                      className="inline-flex min-h-6 items-center rounded-[10px] text-[13px] font-medium text-ink-2 transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                    >
                      How does this work <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </div>

                            <div
                ref={figureRef}
                data-hero-figure
                className="absolute inset-x-0 top-14 will-change-transform md:inset-x-auto md:right-12 md:top-24 md:w-[min(672px,42vw)] xl:!inset-0 xl:!right-auto xl:!top-0 xl:flex xl:h-full xl:w-full xl:items-center xl:justify-center"
              >
                <div
                  data-load="figure"
                  className="landing-load"
                  style={riseStyle(LOAD.figure.delay, LOAD.figure.duration, LOAD.figure.y)}
                >
                  <FigurePanel onScene={handleScene} onDial={handleDial} autoplay={false} />
                </div>
              </div>

              {/* The right HUD column: computed from the model's own curve. */}
              <div className="absolute right-6 top-1/2 z-10 hidden -translate-y-1/2 xl:block">
                <HudReadout scene={scene} active={phase > 0 || atEnd || true} />
              </div>

              <div className="pointer-events-none absolute inset-x-5 bottom-[56px] md:bottom-28 md:left-12 md:right-auto md:w-[min(592px,42vw)]">
                <div className="relative h-[150px] md:h-[178px]">
                  {PHASES.map((item, index) => {
                    const active = phase === index + 1 && !atEnd;
                    return (
                      <div
                        key={item.number}
                        data-phase-caption={index + 1}
                        aria-hidden={!active}
                        className={`landing-fade absolute inset-x-0 bottom-0 transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                        }`}
                      >
                        <p className={`text-brand-text ${type.caption}`}>{item.number}</p>
                        <h2 className={`mt-3 text-ink ${type.h2}`}>{item.title}</h2>
                        <p className={`mt-3 max-w-[420px] text-ink-2 ${type.body}`}>{item.body}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* The captions swap on scroll, which a screen reader cannot see
                  and a keyboard user only hears if something says so. Polite,
                  and short: the number and the title are the phase; the body
                  follows so the announcement is not a teaser. */}
              <p role="status" aria-atomic="true" className="sr-only">
                {announcement
                  ? `Phase ${announcement.number} of 03, ${announcement.title}. ${announcement.body}`
                  : ""}
              </p>

              <div
                data-hero-end
                aria-hidden={!atEnd}
                className={`landing-fade absolute inset-x-5 bottom-[56px] transition-opacity duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:bottom-28 md:left-12 md:right-auto ${
                  atEnd ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <p className={`text-brand-text ${type.caption}`}>Ready when you are</p>
                <div className="mt-4 flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8">
                  <Link
                    href="/simulator"
                    tabIndex={atEnd ? 0 : -1}
                    className="flex h-[52px] w-full items-center justify-center rounded-[10px] bg-brand px-6 text-[15px] font-semibold text-[#04121a] transition-colors hover:bg-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-12 md:w-auto"
                  >
                    Try the simulator
                  </Link>
                  <Link
                    href="/how-it-works"
                    tabIndex={atEnd ? 0 : -1}
                    className="inline-flex min-h-6 items-center rounded-[10px] text-[15px] font-medium text-ink-2 transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                  >
                    How does this work <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

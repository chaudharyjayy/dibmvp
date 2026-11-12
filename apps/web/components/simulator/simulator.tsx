"use client";

/**
 * The simulator: the model in the middle, the inputs on the left, and the
 * walkthrough on the right.
 *
 * The walkthrough is the page's spine. Scrolling it moves the camera to each
 * organ the condition is about and reads out what the engine's own numbers
 * say at that moment. The time dial moves the moment: it drives the same
 * simulated series the model is shaded from, so the numbers on screen and the
 * glow on the body are always the same instant.
 *
 * Two controls, and they do different things: the dial moves time, the
 * scroll moves the camera. Neither one claims anything the engine does not
 * know — the model is a one-compartment pharmacokinetic model and does not
 * model diseases.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download, Save } from "lucide-react";
import {
  simulate,
  buildReport,
  type SimResult,
  type BodyProfile,
  type DoseEvent,
} from "@dib/engine";
import { createDataClient, type DataClient } from "@dib/data-client";
import type { BrainRegion } from "@/components/anatomy/regions";
import SimulatorConsole, { type SimulatorInput } from "./console";
import TimeDial from "./time-dial";
import BodyFigure from "./body-figure";
import {
  conditionById,
  levelsFor,
  momentAt,
  narrate,
  organsFor,
} from "./condition";
import type { FocusOrgan, SimulatorScene } from "./scene";
import { exampleDrug, EXAMPLE_BANNER } from "@/lib/example-drug";

type SexUi = "female" | "male" | "other";
const toEngineSex = (s: SexUi): BodyProfile["sex"] =>
  s === "female" ? "F" : s === "male" ? "M" : "other";

const DEFAULT_INPUT: SimulatorInput = {
  conditionId: "general",
  description: "",
  ageYears: 30,
  weightKg: 70,
  sex: "other",
  doses: [{ timeH: 0, doseMg: 200 }],
  tEndH: 48,
};

/** The organ's name, for the label over the model. */
const ORGAN_LABEL: Record<FocusOrgan, string> = {
  gut: "Gut — the dose's starting point",
  heart: "Blood — where the dose travels",
  lungs: "Lungs — the blood that reaches them",
  liver: "Liver — the body's main clearance",
  kidneys: "Kidneys — filtering what is left",
  brain: "Brain — where the dose finally arrives",
};

export default function Simulator() {
  /* ---- the inputs and the run ---------------------------------------- */

  const [draft, setDraft] = React.useState<SimulatorInput>(DEFAULT_INPUT);
  const [active, setActive] = React.useState<SimulatorInput>(DEFAULT_INPUT);

  /** The hour the dial is on. */
  const [hours, setHours] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  /** The step of the walkthrough the reader is on. */
  const [activeStep, setActiveStep] = React.useState(0);

  /* ---- the model ------------------------------------------------------ */

  const [scene, setScene] = React.useState<SimulatorScene | null>(null);
  const [brainRegion, setBrainRegion] = React.useState<BrainRegion | null>(null);

  /* ---- session -------------------------------------------------------- */

  const [client, setClient] = React.useState<DataClient | null>(null);
  const [signedInEmail, setSignedInEmail] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const profileLoadedRef = React.useRef(false);

  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || key.startsWith("paste-")) return;
    let unsub: (() => void) | null = null;
    try {
      const c = createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
      setClient(c);
      void c.auth.getSession().then(({ data }) => {
        if (data?.session?.email) setSignedInEmail(data.session.email);
      });
      const res = c.auth.onAuthChange((_e, session) => {
        setSignedInEmail(session?.email ?? null);
      });
      if (res.data) unsub = res.data.unsubscribe;
    } catch {
      /* the sign-in state controls saving only; the simulation works regardless */
    }
    return () => unsub?.();
  }, []);

  // Pre-fill the form from the stored profile once, when signed in.
  React.useEffect(() => {
    if (!client || !signedInEmail || profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    void client.profile.getProfile().then(({ data, error }) => {
      if (error || !data) return;
      setDraft((d) => ({
        ...d,
        ageYears: data.ageYears,
        weightKg: data.weightKg,
        sex: data.sex,
      }));
    });
  }, [client, signedInEmail]);

  /* ---- the engine ----------------------------------------------------- */

  const condition = conditionById(active.conditionId);
  const organs = React.useMemo(() => organsFor(condition), [condition]);

  /**
   * The walkthrough: the whole body first, then each organ the condition is
   * about. The first step is the establishing shot — the camera stays on the
   * body and the numbers are the run's overall state.
   */
  const steps = React.useMemo(
    () => [{ organ: null as FocusOrgan | null }, ...organs.map((organ) => ({ organ }))],
    [organs]
  );

  const { result, simError } = React.useMemo((): {
    result: SimResult | null;
    simError: string | null;
  } => {
    const profile: BodyProfile = {
      ageYears: active.ageYears,
      weightKg: active.weightKg,
      sex: toEngineSex(active.sex),
    };
    const doses: DoseEvent[] = active.doses.map((r) => ({
      drugId: exampleDrug.id,
      doseMg: r.doseMg,
      timeH: r.timeH,
    }));
    try {
      return {
        result: simulate({ profile, drug: exampleDrug, doses, tEndH: active.tEndH, dtH: 0.05 }),
        simError: null,
      };
    } catch (e) {
      return { result: null, simError: e instanceof Error ? e.message : "simulation failed" };
    }
  }, [active]);

  const report = result ? buildReport(result) : null;

  /** The engine's numbers at the hour the dial is on. */
  const moment = React.useMemo(() => {
    if (!result) {
      return {
        hours: 0,
        gutMg: 0,
        bodyMg: 0,
        concMgPerL: 0,
        eliminationMgPerH: 0,
      };
    }
    return momentAt(
      result.tH,
      result.gutMg,
      result.bodyMg,
      result.concMgPerL,
      result.eliminationMgPerH,
      hours
    );
  }, [result, hours]);

  /**
   * The peak of each quantity over the whole run.
   *
   * The organ levels are normalised against these, so each one is compared
   * with its own kind: the concentration with the concentration, the
   * clearance with the clearance.
   */
  const peaks = React.useMemo(() => {
    const empty = { concMgPerL: 0, eliminationMgPerH: 0 };
    if (!result) return empty;
    const peakOf = (values: number[]) => values.reduce((max, v) => (v > max ? v : max), 0);
    return {
      concMgPerL: peakOf(result.concMgPerL),
      eliminationMgPerH: peakOf(result.eliminationMgPerH),
    };
  }, [result]);

  const levels = React.useMemo(() => levelsFor(moment, peaks), [moment, peaks]);

  /* ---- the scroll drives the camera ----------------------------------- */

  const stepRefs = React.useRef<(HTMLElement | null)[]>([]);

  React.useEffect(() => {
    stepRefs.current = stepRefs.current.slice(0, steps.length);

    // The step the reader is on is the one whose middle is nearest the
    // middle of the screen. Measuring on scroll rather than by intersection
    // means the camera changes when the step is centred, not when its edge
    // crosses the screen.
    let raf = 0;
    const measure = () => {
      raf = 0;
      const middle = window.innerHeight / 2;
      let best = 0;
      let bestDistance = Infinity;
      stepRefs.current.forEach((element, index) => {
        if (!element) return;
        const box = element.getBoundingClientRect();
        const distance = Math.abs(box.top + box.height / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setActiveStep(best);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [steps.length, active.conditionId]);

  // A new condition means a new walkthrough: start it at the first organ.
  React.useEffect(() => {
    setActiveStep(0);
  }, [active.conditionId]);

  const focusOrgan: FocusOrgan | null = steps[activeStep]?.organ ?? null;

  React.useEffect(() => {
    scene?.focusOrgan(focusOrgan);
    scene?.setFocus(focusOrgan);
  }, [scene, focusOrgan]);

  React.useEffect(() => {
    scene?.setLevels(levels);
  }, [scene, levels]);

  // The dial is clamped to the window of the run it belongs to.
  React.useEffect(() => {
    setHours((h) => Math.min(h, active.tEndH));
  }, [active.tEndH]);

  // Play: the dial advances on its own and loops.
  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setHours((h) => {
        const step = Math.max(0.05, active.tEndH / 240);
        const next = h + step;
        return next > active.tEndH ? 0 : next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [playing, active.tEndH]);

  /* ---- running and saving --------------------------------------------- */

  const run = React.useCallback(() => {
    setActive({ ...draft });
    setHours(0);
    setPlaying(false);
    setAction(null);
    // The walkthrough starts again at the first organ.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [draft]);

  const saveReport = React.useCallback(async () => {
    if (!client || !result || !report || saving) return;
    setSaving(true);
    setAction(null);

    // One entry per (drug, amount), each carrying every time that amount was
    // given.
    const byAmount = new Map<number, number[]>();
    for (const r of active.doses) {
      const times = byAmount.get(r.doseMg) ?? [];
      times.push(r.timeH);
      byAmount.set(r.doseMg, times);
    }
    const drugs = [...byAmount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([doseMg, times]) => ({
        drugId: exampleDrug.id,
        doseMg,
        times: [...new Set(times)].sort((a, b) => a - b),
      }));

    const summaryText = [
      "Synthetic demo parameters — not real pharmacology.",
      active.description.trim() ? `Case: ${active.description.trim().slice(0, 400)}` : "",
      ...report.bullets,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000);

    const { error } = await client.reports.saveReport({
      title: `${exampleDrug.name} — ${new Date().toISOString().slice(0, 10)}`,
      profileSnapshot: {
        ageYears: active.ageYears,
        weightKg: active.weightKg,
        sex: active.sex,
      },
      drugs,
      metrics: {
        cmaxMgPerL: result.cmaxMgPerL,
        tmaxH: result.tmaxH,
        timeToClearH: result.timeToClearH,
      },
      // No verified interaction pairs exist yet. Sending [] is the honest value.
      warnings: [],
      summary: summaryText,
      summarySource: "template",
      engineVersion: "0.1.0",
    });
    setSaving(false);
    setAction(error ? `Save failed: ${error.message}` : "Report saved to your account.");
  }, [active, client, report, result, saving]);

  const saveProfile = React.useCallback(async () => {
    if (!client) return;
    setAction(null);
    const { error } = await client.profile.saveProfile({
      ageYears: draft.ageYears,
      weightKg: draft.weightKg,
      sex: draft.sex,
    });
    setAction(error ? `Profile save failed: ${error.message}` : "Profile saved to your account.");
  }, [client, draft]);

  /* ---- render ---------------------------------------------------------- */

  const readouts = [
    { label: "Concentration", value: `${moment.concMgPerL.toFixed(3)}`, unit: "mg/L" },
    { label: "In the gut", value: `${moment.gutMg.toFixed(1)}`, unit: "mg" },
    { label: "In the blood", value: `${moment.bodyMg.toFixed(1)}`, unit: "mg" },
    { label: "Clearing", value: `${moment.eliminationMgPerH.toFixed(2)}`, unit: "mg/h" },
  ];

  return (
    <div className="relative min-h-screen bg-page text-ink">
      {/* The HUD backdrop, the same one the landing page sits on. */}
      <div className="hud-backdrop" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="hud-grid" />
        <div className="hud-scanlines" />
        <div className="hud-vignette" />
      </div>

      {/* The bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Back
            </Link>
            <span aria-hidden="true" className="h-4 w-px bg-line-strong" />
            <h1 className="font-mono text-[12px] uppercase tracking-[0.22em] text-ink">
              Simulator
            </h1>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 sm:inline">
              {exampleDrug.name}
            </span>
          </div>
          <p className="max-w-[46ch] text-right font-mono text-[10px] uppercase leading-4 tracking-[0.1em] text-warn">
            <span className="sm:hidden">Fake drug · test values</span>
            <span className="hidden sm:inline">
              {EXAMPLE_BANNER.split(". ").slice(0, 2).join(". ")}.
            </span>
          </p>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1800px] grid-cols-1 gap-5 px-4 pb-24 pt-5 lg:grid-cols-[330px_minmax(0,1fr)_400px] lg:gap-6">
        {/* ---- the model, in the middle ---- */}
        <section
          aria-label="The anatomy"
          className="order-1 flex flex-col gap-3 lg:order-2 lg:sticky lg:top-[84px] lg:h-[calc(100svh-140px)]"
        >
          <div className="hud-corners relative min-h-[46svh] flex-1 overflow-hidden rounded-[12px] border border-line bg-page/40 lg:min-h-0">
            <BodyFigure
              scene={scene}
              focus={focusOrgan}
              focusLabel={focusOrgan ? ORGAN_LABEL[focusOrgan] : null}
              onScene={setScene}
              onBrainRegion={setBrainRegion}
            />
            {/* The scanner sweep, the same one the landing figure has. */}
            <div className="hud-scan" aria-hidden="true" />
          </div>

          {/* The readouts: the engine's numbers at the dial's hour. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
            {readouts.map((item) => (
              <div key={item.label} className="bg-surface/80 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                  {item.label}
                </p>
                <p className="mt-0.5 font-mono text-[15px] leading-6 tabular-nums text-brand-text">
                  {item.value}
                  <span className="ml-1 text-[11px] text-ink-3">{item.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* The dial: it moves the moment everything else is drawn from. */}
          <div className="rounded-[10px] border border-line bg-surface/60 px-3 py-3">
            <TimeDial
              maxH={active.tEndH}
              hours={hours}
              onHours={setHours}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              tmaxH={result?.tmaxH ?? null}
            />
            <p className="mt-2 font-mono text-[10px] uppercase leading-4 tracking-[0.1em] text-ink-3">
              Dial moves time · scroll moves the camera
            </p>
          </div>

          {brainRegion ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
              Pointer on {brainRegion.display} — {brainRegion.part}
            </p>
          ) : null}
        </section>

        {/* ---- the inputs ---- */}
        <aside
          aria-label="Simulation inputs"
          className="order-2 lg:order-1 lg:sticky lg:top-[84px] lg:h-[calc(100svh-140px)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="rounded-[12px] border border-line bg-surface/70 p-4">
            <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-2">
              Inputs
            </h2>
            <SimulatorConsole
              value={draft}
              onChange={setDraft}
              onSubmit={run}
              error={simError}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {client && signedInEmail ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveReport()}
                    disabled={saving || !result}
                    className="inline-flex items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:border-brand-text hover:text-brand-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    {saving ? "Saving…" : "Save report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-ink-2 transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Save profile
                  </button>
                </>
              ) : (
                <p className="text-[13px] text-ink-3">
                  <Link href="/signin" className="underline hover:text-brand-text">
                    Sign in
                  </Link>{" "}
                  to save reports.
                </p>
              )}
            </div>

            {action ? (
              <p role="status" className="mt-3 text-[13px] text-ink-2">
                {action}
              </p>
            ) : null}
          </div>
        </aside>

        {/* ---- the walkthrough ---- */}
        <div className="order-3 lg:order-3">
          <h2 className="sr-only">The walkthrough</h2>
          {steps.map((step, index) => {
            const narration = narrate(step.organ, moment, condition);
            const isActive = index === activeStep;
            return (
              <article
                key={`${condition.id}-${step.organ ?? "body"}`}
                ref={(el) => {
                  stepRefs.current[index] = el;
                }}
                data-step={index}
                aria-current={isActive ? "step" : undefined}
                className={`flex min-h-[58vh] flex-col justify-center border-l-2 py-10 pl-6 transition-colors duration-300 ${
                  isActive ? "border-brand-text" : "border-line"
                }`}
              >
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-mono text-[11px] tabular-nums tracking-[0.2em] ${
                      isActive ? "text-brand-text" : "text-ink-3"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}/{String(steps.length).padStart(2, "0")}
                  </span>
                  <h3 className="text-[19px] font-semibold leading-7 tracking-tight text-ink">
                    {narration.title}
                  </h3>
                </div>

                <p className="mt-3 max-w-[46ch] text-[14px] leading-6 text-ink-2">
                  {narration.body}
                </p>

                <dl className="mt-5 grid max-w-[46ch] grid-cols-2 gap-2">
                  {narration.figures.map((figure) => (
                    <div
                      key={figure.label}
                      className="rounded-[8px] border border-line bg-surface/70 px-3 py-2"
                    >
                      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                        {figure.label}
                      </dt>
                      <dd className="mt-0.5 font-mono text-[15px] tabular-nums text-brand-text">
                        {figure.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}

          {/* The engine's own summary, where the curve chart used to be. */}
          {report ? (
            <article className="flex min-h-[46vh] flex-col justify-center border-l-2 border-line py-10 pl-6">
              <h3 className="text-[19px] font-semibold leading-7 tracking-tight text-ink">
                The engine&rsquo;s own summary
              </h3>
              <ul className="mt-3 space-y-1.5">
                {report.bullets.map((bullet) => (
                  <li key={bullet} className="max-w-[46ch] font-mono text-[13px] leading-6 text-ink-2">
                    {bullet}
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-[46ch] text-[12px] leading-5 text-ink-3">
                {report.disclaimer}
              </p>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}

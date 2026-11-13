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
import TimeDial, { type DialSource } from "./time-dial";
import BodyFigure from "./body-figure";
import StepLiterature from "./step-literature";
import { rise } from "./motion";
import {
  conditionById,
  levelsFor,
  momentAt,
  narrate,
  organsFor,
} from "./condition";
import type { FocusOrgan, SimulatorScene } from "./scene";
import OrganMonitor from "./organ-monitor";
import { drugFromPk, DRUG_COLORS, SEPARATE_CURVES_CAPTION, type MedicationRun } from "@/lib/treatment";
import { getApprovedCitations, getApprovedPk } from "@/lib/catalogue";
import type { DrugParameterCitation, DrugPkRow } from "@dib/data-client";
import { topicForOrgan } from "@/lib/pubmed";

type SexUi = "female" | "male" | "other";
const toEngineSex = (s: SexUi): BodyProfile["sex"] =>
  s === "female" ? "F" : s === "male" ? "M" : "other";

const DEFAULT_INPUT: SimulatorInput = {
  conditionId: "general",
  description: "",
  ageYears: 30,
  weightKg: 70,
  sex: "other",
  drugs: [],
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
  /** The same value as a ref, so the scroll measurement can read it. */
  const activeStepRef = React.useRef(0);
  React.useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);

  /* ---- the model ------------------------------------------------------ */

  const [scene, setScene] = React.useState<SimulatorScene | null>(null);
  /** Which view the right column is showing. */
  const [rightView, setRightView] = React.useState<"walkthrough" | "monitor">("walkthrough");
  /** The organ the visitor is watching, in the monitor. */
  const [monitorFocus, setMonitorFocus] = React.useState<FocusOrgan | null>(null);
  const [brainRegion, setBrainRegion] = React.useState<BrainRegion | null>(null);

  /** The readout row, so a change can sweep a light across it. */
  const readoutsRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Sweeps a light across the readouts when the visitor moves the dial.
   *
   * It never runs on the play loop, which updates sixteen times a second:
   * that would be a strobe, and the numbers have to stay the engine's own.
   */
  const sweepReadouts = React.useCallback(() => {
    const element = readoutsRef.current;
    if (!element) return;
    element.classList.remove("sim-tick");
    // Force the style to be recalculated so the animation restarts.
    void element.offsetWidth;
    element.classList.add("sim-tick");
  }, []);

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

  /**
   * Approved PK rows for the treatment's medicines, fetched once per drug.
   * A medicine can only enter the console when the catalogue says its PK
   * exists; this cache is what lets the engine read the actual values.
   */
  const [pkRows, setPkRows] = React.useState<Map<string, DrugPkRow>>(new Map());
  React.useEffect(() => {
    let cancelled = false;
    for (const drug of active.drugs) {
      if (pkRows.has(drug.drugId)) continue;
      getApprovedPk(drug.drugId)
        .then((pk) => {
          if (cancelled || !pk || pk === "error" || pk === "unconfigured") return;
          setPkRows((prev) => new Map(prev).set(drug.drugId, pk as DrugPkRow));
        })
        .catch(() => {
          /* the drug stays unrunnable without its row; the console says why */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active.drugs, pkRows]);

  /**
   * The citation behind each value of each medicine's parameters. This is what
   * the console shows under a medicine, so a number can always be traced to the
   * document that states it.
   */
  const [citations, setCitations] = React.useState<Map<string, DrugParameterCitation[]>>(
    new Map()
  );
  React.useEffect(() => {
    let cancelled = false;
    // The console edits a draft treatment and the run uses an active one, so
    // both are covered: a medicine's sources have to be there while it is
    // being added, not only after the simulation is run.
    const drugs = [...active.drugs, ...draft.drugs];
    for (const drug of drugs) {
      if (citations.has(drug.drugId)) continue;
      getApprovedCitations(drug.drugId)
        .then((list) => {
          if (cancelled || !list || list === "error" || list === "unconfigured") return;
          setCitations((prev) => new Map(prev).set(drug.drugId, list as DrugParameterCitation[]));
        })
        .catch(() => {
          /* the parameters still run; only the sources line is missing */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active.drugs, draft.drugs, citations]);

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

  /** The treatment's medicines for the strips — memoised so the strip's
   * effect does not re-run (and cancel its fetches) on every re-render. */
  const stripDrugs = React.useMemo(
    () => active.drugs.map((d) => ({ id: d.drugId, name: d.name })),
    [active.drugs],
  );

  const { runs, simError } = React.useMemo((): {
    runs: MedicationRun[] | null;
    simError: string | null;
  } => {
    if (active.drugs.length === 0) return { runs: null, simError: null };
    // Every medicine needs its approved row before anything runs.
    if (!active.drugs.every((d) => d.hasPk && pkRows.has(d.drugId))) {
      return { runs: null, simError: null };
    }
    const profile: BodyProfile = {
      ageYears: active.ageYears,
      weightKg: active.weightKg,
      sex: toEngineSex(active.sex),
    };
    try {
      const out: MedicationRun[] = [];
      for (const [index, line] of active.drugs.entries()) {
        const pk = pkRows.get(line.drugId);
        if (!pk) continue;
        const drug = drugFromPk({ id: line.drugId, name: line.name }, pk);
        if (!drug) continue;
        const doses: DoseEvent[] = line.doses.map((r) => ({
          drugId: line.drugId,
          doseMg: r.doseMg,
          timeH: r.timeH,
        }));
        out.push({
          id: line.drugId,
          name: line.name,
          color: DRUG_COLORS[index % DRUG_COLORS.length],
          result: simulate({ profile, drug, doses, tEndH: active.tEndH, dtH: 0.05 }),
        });
      }
      return { runs: out.length > 0 ? out : null, simError: null };
    } catch (e) {
      return { runs: null, simError: e instanceof Error ? e.message : "simulation failed" };
    }
  }, [active, pkRows]);

  const single = runs?.length === 1 ? runs[0] : null;
  /** One engine summary per medicine — never one combined summary. */
  const reports = React.useMemo(
    () => (runs ?? []).map((r) => ({ run: r, report: buildReport(r.result) })),
    [runs]
  );

  /** The treatment's name for the header and the report title. */
  const treatmentLabel = React.useMemo(() => {
    if (active.drugs.length === 0) return "No medicine added";
    if (active.drugs.length === 1) return active.drugs[0].name;
    return `${active.drugs.length} medicines — modelled separately`;
  }, [active.drugs]);

  /** The engine's numbers at the hour the dial is on, per medicine. */
  const breakdown = React.useMemo(
    () =>
      (runs ?? []).map((r) => ({
        name: r.name,
        color: r.color,
        moment: momentAt(
          r.result.tH,
          r.result.gutMg,
          r.result.bodyMg,
          r.result.concMgPerL,
          r.result.eliminationMgPerH,
          hours
        ),
      })),
    [runs, hours]
  );

  const moment = breakdown[0]?.moment ?? {
    hours: 0,
    gutMg: 0,
    bodyMg: 0,
    concMgPerL: 0,
    eliminationMgPerH: 0,
  };

  /**
   * The peak of each quantity, per medicine, over the whole run.
   *
   * The organ fill is normalised against the strongest mover among the
   * treatment's medicines; each medicine is still drawn against its own kind
   * of quantity.
   */
  const peaks = React.useMemo(() => {
    const empty = { concMgPerL: 0, eliminationMgPerH: 0 };
    if (!runs || runs.length === 0) return empty;
    const peakOf = (values: number[]) => values.reduce((max, v) => (v > max ? v : max), 0);
    return {
      concMgPerL: Math.max(...runs.map((r) => peakOf(r.result.concMgPerL))),
      eliminationMgPerH: Math.max(...runs.map((r) => peakOf(r.result.eliminationMgPerH))),
    };
  }, [runs]);

  const levels = React.useMemo(() => {
    if (breakdown.length === 0) return levelsFor(moment, peaks);
    // The strongest mover among the medicines holds the fill.
    const perBreakdown = breakdown.map((b) => levelsFor(b.moment, peaks));
    const first = perBreakdown[0];
    return Object.fromEntries(
      Object.keys(first).map((key) => [
        key,
        Math.max(...perBreakdown.map((l) => l[key] ?? 0)),
      ])
    ) as Record<string, number>;
  }, [breakdown, peaks, moment]);

  /* ---- the scroll drives the camera ----------------------------------- */

  const stepRefs = React.useRef<(HTMLElement | null)[]>([]);

  React.useEffect(() => {
    stepRefs.current = stepRefs.current.slice(0, steps.length);

    // The step the reader is on is the one whose middle is nearest the
    // middle of the screen. Measuring on scroll rather than by intersection
    // means the camera changes when the step is centred, not when its edge
    // crosses the screen.
    //
    // A challenger has to be clearly nearer before the step changes: without
    // that dead band the camera flips between two adjacent steps as the
    // boundary passes, and the accent flickers with it.
    const DEAD_BAND = window.innerHeight * 0.12;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const middle = window.innerHeight / 2;
      let best = 0;
      let bestDistance = Infinity;
      let currentDistance = Infinity;
      stepRefs.current.forEach((element, index) => {
        if (!element) return;
        const box = element.getBoundingClientRect();
        const distance = Math.abs(box.top + box.height / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
        if (index === activeStepRef.current) currentDistance = distance;
      });
      // The current step keeps the focus until a challenger is clearly
      // nearer. Without the dead band the camera flips between two adjacent
      // steps as the boundary passes, and the accent flickers with it.
      if (best !== activeStepRef.current && currentDistance - bestDistance > DEAD_BAND) {
        setActiveStep(best);
      }
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

  const walkthroughFocus: FocusOrgan | null = steps[activeStep]?.organ ?? null;
  /** The camera's organ: the monitor's selection when it is on screen,
   *  otherwise the walkthrough's step. */
  const focusOrgan = rightView === "monitor" ? monitorFocus : walkthroughFocus;

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

  /** The dial moved. A visitor's move is swept; the play loop is not. */
  const handleHours = React.useCallback(
    (next: number, source: DialSource) => {
      setHours(next);
      if (source === "user") sweepReadouts();
    },
    [sweepReadouts]
  );

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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [draft]);

  const saveReport = React.useCallback(async () => {
    if (!client || runs === null || reports.length === 0 || saving) return;
    setSaving(true);
    setAction(null);

    // One entry per (medicine, amount), each carrying every time that
    // amount was given.
    const drugs = active.drugs.flatMap((line) => {
      const byAmount = new Map<number, number[]>();
      for (const r of line.doses) {
        const times = byAmount.get(r.doseMg) ?? [];
        times.push(r.timeH);
        byAmount.set(r.doseMg, times);
      }
      return [...byAmount.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([doseMg, times]) => ({
          drugId: line.drugId,
          doseMg,
          times: [...new Set(times)].sort((a, b) => a - b),
        }));
    });

    const perMedicine = reports.map(
      ({ run, report }) =>
        `${run.name}: ${report.bullets.join("; ")}`
    );
    const summaryText = [
      reports.length > 1
        ? "Each medicine is modelled separately on its own approved row. Interactions are not modelled."
        : "Parameters sourced from the approved, cited PK row.",
      active.description.trim() ? `Case: ${active.description.trim().slice(0, 400)}` : "",
      ...perMedicine,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000);

    // The report schema carries one metrics object; it is the first
    // medicine's, and the summary names it — the panel never sums.
    const first = reports[0].run.result;

    const { error } = await client.reports.saveReport({
      title: `${treatmentLabel} — ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
      profileSnapshot: {
        ageYears: active.ageYears,
        weightKg: active.weightKg,
        sex: active.sex,
      },
      drugs,
      metrics: {
        cmaxMgPerL: first.cmaxMgPerL,
        tmaxH: first.tmaxH,
        timeToClearH: first.timeToClearH,
      },
      // No verified interaction pairs exist yet. Sending [] is the honest value.
      warnings: [],
      summary: summaryText,
      summarySource: "template",
      engineVersion: "0.1.0",
    });
    setSaving(false);
    setAction(error ? `Save failed: ${error.message}` : "Report saved to your account.");
  }, [active, client, reports, runs, saving]);

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

  return (
    <div className="relative z-[2] min-h-screen text-ink">
      {/* The HUD backdrop, the same one the landing page sits on. */}
      <div className="hud-backdrop" aria-hidden="true" />
      <div className="hud-panel" aria-hidden="true">
        <div className="hud-grid" />
        <div className="hud-scanlines" />
        <div className="hud-vignette" />
      </div>

      {/* The bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur-md">
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
            <h1 className="font-heading text-[15px] font-semibold uppercase tracking-[0.2em] text-ink">
              Simulator
            </h1>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 sm:inline">
              {treatmentLabel}
            </span>
          </div>
          <p className="max-w-[46ch] text-right font-mono text-[10px] uppercase leading-4 tracking-[0.1em] text-warn">
            <span className="sm:hidden">
              {active.drugs.length > 0 ? "PK sourced · cited" : "No medicine"}
            </span>
            <span className="hidden sm:inline">
              {active.drugs.length > 0
                ? "Parameters from the approved, cited PK rows. Each medicine is modelled separately — interactions are not modelled."
                : "No medicine added. Search the catalogue to build a treatment."}
            </span>
          </p>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1800px] grid-cols-1 gap-5 px-4 pb-24 pt-5 xl:grid-cols-[330px_minmax(0,1fr)_400px] xl:gap-6">
        {/* ---- the model, in the middle ---- */}
        <section
          aria-label="The anatomy"
          className="sim-rise order-1 flex flex-col gap-3 xl:order-2 xl:sticky xl:top-[84px] xl:h-[calc(100svh-140px)]"
          style={rise(80)}
        >
          <div className="hud-corners relative min-h-[40svh] flex-1 overflow-hidden rounded-[12px] border border-line bg-page/40 xl:min-h-0">
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
          <div
            ref={readoutsRef}
            className="sim-rise overflow-hidden rounded-[10px] border border-line bg-line"
            style={rise(260)}
          >
            <div className="flex items-center justify-between bg-surface/80 px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Model values
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                Per medicine
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-line/60">
                    {["Medicine", "Concentration", "In the gut", "In the blood", "Clearing"].map((h) => (
                      <th
                        key={h}
                        className="bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] font-normal text-ink-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(runs ?? []).map((run) => {
                    const b = breakdown.find((x) => x.name === run.name);
                    if (!b) return null;
                    const m = b.moment;
                    return (
                      <tr key={run.id} className="border-b border-line/40 last:border-b-0">
                        <td className="bg-surface/80 px-3 py-1.5 text-[13px] text-ink">
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ background: run.color }}
                            aria-hidden="true"
                          />
                          {run.name}
                        </td>
                        {[
                          `${m.concMgPerL.toFixed(3)} mg/L`,
                          `${m.gutMg.toFixed(1)} mg`,
                          `${m.bodyMg.toFixed(1)} mg`,
                          `${m.eliminationMgPerH.toFixed(2)} mg/h`,
                        ].map((v, i) => (
                          <td
                            key={i}
                            className="bg-surface/80 px-3 py-1.5 font-mono text-[13px] tabular-nums text-brand-text"
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {runs === null ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-surface/80 px-3 py-3 text-[12px] text-ink-3"
                      >
                        Nothing to show yet — add a medicine and run.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line/60 bg-surface/80 px-3 py-1.5 text-[11px] leading-4 text-warn">
              {SEPARATE_CURVES_CAPTION}
            </p>
          </div>

          {/* The dial: it moves the moment everything else is drawn from. */}
          <div
            className="sim-rise rounded-[10px] border border-line bg-surface/60 px-3 py-3 transition-colors duration-300 hover:border-line-strong"
            style={rise(320)}
          >
            <TimeDial
              maxH={active.tEndH}
              hours={hours}
              onHours={handleHours}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              tmaxH={single ? single.result.tmaxH : null}
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
          className="sim-rise order-2 xl:order-1 xl:sticky xl:top-[84px] xl:h-[calc(100svh-140px)] xl:overflow-y-auto xl:pr-1"
          style={rise(0)}
        >
          <div className="rounded-[12px] border border-line bg-surface/70 p-4">
            <h2 className="mb-4 font-heading text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-2">
              Inputs
            </h2>
            <SimulatorConsole
              value={draft}
              onChange={setDraft}
              onSubmit={run}
              error={simError}
              citations={citations}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {client && signedInEmail ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveReport()}
                    disabled={saving || reports.length === 0 || runs === null}
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
        <div className="order-3 xl:order-3">
          <div className="sticky top-[84px]">
            <div
              role="tablist"
              aria-label="Right panel view"
              className="mb-4 flex gap-1 rounded-[10px] border border-line bg-surface/60 p-1"
            >
              {(
                [
                  ["walkthrough", "Walkthrough"],
                  ["monitor", "Organ monitor"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={rightView === id}
                  aria-controls={`right-panel-${id}`}
                  id={`right-tab-${id}`}
                  onClick={() => setRightView(id)}
                  className={`flex-1 rounded-[8px] py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
                    rightView === id ? "bg-brand text-[#04121a]" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {rightView === "monitor" ? (
              <div
                role="tabpanel"
                id="right-panel-monitor"
                aria-labelledby="right-tab-monitor"
                className="overflow-hidden rounded-[10px] border border-line bg-surface/40"
              >
                <OrganMonitor
                  runs={runs}
                  hours={hours}
                  focus={monitorFocus}
                  onToggleFocus={(organ) => setMonitorFocus(organ)}
                />
              </div>
            ) : null}
          </div>

          {rightView === "walkthrough" ? (
            <div role="tabpanel" id="right-panel-walkthrough" aria-labelledby="right-tab-walkthrough">
          <h2 className="sr-only">The walkthrough</h2>
          {steps.map((step, index) => {
            const narration = narrate(step.organ, moment, condition, breakdown);
            const isActive = index === activeStep;
            return (
              <article
                key={`${condition.id}-${step.organ ?? "body"}`}
                ref={(el) => {
                  stepRefs.current[index] = el;
                }}
                data-step={index}
                aria-current={isActive ? "step" : undefined}
                className={`flex min-h-[58vh] flex-col justify-center border-l-2 py-10 pl-6 transition-[border-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  isActive ? "border-brand-text" : "border-line"
                }`}
              >
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-mono text-[11px] tabular-nums tracking-[0.2em] transition-colors duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                      isActive ? "text-brand-text" : "text-ink-3"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}/{String(steps.length).padStart(2, "0")}
                  </span>
                  <h3 className="font-heading text-[19px] font-semibold leading-7 tracking-tight text-ink">
                    {narration.title}
                  </h3>
                </div>

                <p className="mt-3 max-w-[46ch] text-[14px] leading-6 text-ink-2">
                  {narration.body}
                </p>

                {narration.groups ? (
                  <div className="mt-5 space-y-4">
                    {narration.groups.map((group) => (
                      <div key={group.name}>
                        <p className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: group.color }}
                            aria-hidden="true"
                          />
                          {group.name}
                        </p>
                        <dl className="grid max-w-[46ch] grid-cols-2 gap-2">
                          {group.figures.map((figure) => (
                            <div
                              key={figure.label}
                              className={`rounded-[8px] border bg-surface/70 px-3 py-2 transition-[border-color,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none ${
                                isActive ? "border-brand/35" : "border-line"
                              }`}
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
                      </div>
                    ))}
                  </div>
                ) : null}
                <dl className={`${narration.groups ? "hidden" : "mt-5 grid max-w-[46ch] grid-cols-2 gap-2"}`}>
                  {narration.figures.map((figure) => (
                    <div
                      key={figure.label}
                      className={`rounded-[8px] border bg-surface/70 px-3 py-2 transition-[border-color,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none ${
                        isActive ? "border-brand/35" : "border-line"
                      }`}
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

                {/* Published papers about the process this step narrates. */}
                <StepLiterature
                  topic={topicForOrgan(step.organ)}
                  drugs={stripDrugs}
                />
              </article>
            );
          })}

          {/* One engine summary per medicine — never a shared summary. */}
          {reports.map(({ run, report }: { run: MedicationRun; report: { bullets: string[]; disclaimer: string } }) => (
            <article
              key={run.id}
              className="flex min-h-[46vh] flex-col justify-center border-l-2 border-line py-10 pl-6"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: run.color }}
                  aria-hidden="true"
                />
                <h3 className="font-heading text-[19px] font-semibold leading-7 tracking-tight text-ink">
                  The engine&rsquo;s summary — {run.name}
                </h3>
              </div>
              <ul className="mt-3 space-y-1.5">
                {report.bullets.map((bullet: string) => (
                  <li key={bullet} className="max-w-[46ch] font-mono text-[13px] leading-6 text-ink-2">
                    {bullet}
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-[46ch] text-[12px] leading-5 text-ink-3">
                {report.disclaimer}
              </p>
            </article>
          ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

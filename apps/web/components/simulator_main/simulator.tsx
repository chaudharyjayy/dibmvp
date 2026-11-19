"use client";

/**
 * The simulator: one 3D model, with the inputs beside it, and the experiment's
 * graphs and written details below it.
 *
 * Only the model the run is executed on is drawn in 3D. The healthy reference
 * survives as a graph, not as a second body: its curves are compared with the
 * model's on the same scale. Everything below the model — the live status, the
 * organ traces and the narrated walkthrough — is reached by scrolling down the
 * page, so the 3D view stays the first thing on screen.
 *
 * Two controls do different things: the dial moves time, the scroll moves the
 * camera. Neither claims anything the engine does not know — it is a
 * one-compartment pharmacokinetic model and does not model diseases.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download, Save } from "lucide-react";
import {
  simulate,
  buildReport,
  getDefaultOrganProfiles,
  type SimResult,
  type BodyProfile,
  type DoseEvent,
} from "@dib/engine";
import { createDataClient, type DataClient } from "@dib/data-client";
import type { BrainRegion } from "@/components/anatomy/regions";
import SimulatorConsole, { normalizeInput, type SimulatorInput } from "./console";
import TimeDial, { type DialSource, type TimelineSection } from "./time-dial";
import BodyFigure from "./body-figure";
import ThemeSwitch from "@/components/theme/theme-switch";
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
import {
  compareRuns,
  SCENARIO_CONTEXT,
  scenarioById,
  withClearanceScenario,
} from "@/lib/kidney-scenario";
import type { DrugParameterCitation, DrugPkRow } from "@dib/data-client";
import { topicForOrgan } from "@/lib/pubmed";

type SexUi = "female" | "male" | "other";
const toEngineSex = (s: SexUi): BodyProfile["sex"] =>
  s === "female" ? "F" : s === "male" ? "M" : "other";

const DEFAULT_INPUT: SimulatorInput = {
  conditionId: "general",
  description: "",
  // Number boxes start at 0. Empty stays empty until a run resolves it.
  ageYears: "0",
  weightKg: "0",
  sex: "other",
  drugs: [],
  tEndH: 48,
  organProfiles: getDefaultOrganProfiles(),
  clearanceScenario: "baseline",
  extraFields: [],
};

/** A number box's text as a number; empty or 0 falls back to a reference adult. */
const toNumber = (text: string, fallback: number): number => {
  const value = text.trim() === "" ? 0 : Number(text);
  return Number.isFinite(value) && value !== 0 ? value : fallback;
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
  /** Playback speed multiplier, shared with the timeline controls. */
  const [speed, setSpeed] = React.useState(1);
  /** Whether the expanded full timeline is showing. */
  const [fullTimelineOpen, setFullTimelineOpen] = React.useState(false);

  /** The step of the walkthrough the reader is on. */
  const [activeStep, setActiveStep] = React.useState(0);
  /** The same value as a ref, so the scroll measurement can read it. */
  const activeStepRef = React.useRef(0);
  React.useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);

  /* ---- the model ------------------------------------------------------ */

  const [scene, setScene] = React.useState<SimulatorScene | null>(null);
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
        ageYears: String(data.ageYears),
        weightKg: String(data.weightKg),
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

  const { runs, healthyRuns, simError } = React.useMemo((): {
    runs: MedicationRun[] | null;
    healthyRuns: MedicationRun[] | null;
    simError: string | null;
  } => {
    const empty = { runs: null, healthyRuns: null, simError: null };
    if (active.drugs.length === 0) return empty;
    // Every medicine needs its approved row before anything runs.
    if (!active.drugs.every((d) => d.hasPk && pkRows.has(d.drugId))) return empty;

    const ageYears = toNumber(active.ageYears, 30);
    const weightKg = toNumber(active.weightKg, 70);
    const profile: BodyProfile = {
      ageYears,
      weightKg,
      sex: toEngineSex(active.sex),
      organProfiles: active.organProfiles,
    };
    // The healthy reference keeps every input the same except the organ
    // archetypes — those become the healthy adult defaults.
    const healthyProfile: BodyProfile = {
      ...profile,
      organProfiles: getDefaultOrganProfiles(),
    };
    try {
      const out: MedicationRun[] = [];
      const healthy: MedicationRun[] = [];
      for (const [index, line] of active.drugs.entries()) {
        const pk = pkRows.get(line.drugId);
        if (!pk) continue;
        const drug = drugFromPk({ id: line.drugId, name: line.name }, pk);
        if (!drug) continue;
        const doses: DoseEvent[] = line.doses.map((r) => ({
          drugId: line.drugId,
          doseMg: Number(r.doseMg) || 0,
          timeH: Number(r.timeH) || 0,
        }));
        const runArgs = { doses, tEndH: active.tEndH, dtH: 0.05 };
        // The cited (organ-profile-adjusted) run is always kept. A what-if
        // adds a second run on a scaled copy of the drug; the approved row
        // itself is never changed.
        const baseline = simulate({ ...runArgs, profile, drug });
        const result =
          active.clearanceScenario === "baseline"
            ? baseline
            : simulate({
                ...runArgs,
                profile,
                drug: withClearanceScenario(drug, active.clearanceScenario),
              });
        out.push({
          id: line.drugId,
          name: line.name,
          color: DRUG_COLORS[index % DRUG_COLORS.length],
          result,
          ...(active.clearanceScenario === "baseline" ? {} : { baseline }),
        });
        // The reference is always the cited, unscaled run on healthy organs.
        healthy.push({
          id: line.drugId,
          name: line.name,
          color: DRUG_COLORS[index % DRUG_COLORS.length],
          result: simulate({ ...runArgs, profile: healthyProfile, drug }),
        });
      }
      return {
        runs: out.length > 0 ? out : null,
        healthyRuns: healthy.length > 0 ? healthy : null,
        simError: null,
      };
    } catch (e) {
      return { runs: null, healthyRuns: null, simError: e instanceof Error ? e.message : "simulation failed" };
    }
  }, [active, pkRows]);

  const single = runs?.length === 1 ? runs[0] : null;
  /** One engine summary per medicine — never one combined summary. */
  const reports = React.useMemo(
    () => (runs ?? []).map((r) => ({ run: r, report: buildReport(r.result) })),
    [runs]
  );

  /** The first fatal organ failure across the treatment's medicines. */
  const death = React.useMemo(() => {
    for (const run of runs ?? []) {
      const tox = run.result.toxicity;
      if (tox?.death) {
        return {
          ...tox.death,
          drugName: run.name,
          message: tox.message ?? "",
        };
      }
    }
    return null;
  }, [runs]);

  // Death freezes the timeline at the moment of failure: no play, no advance.
  React.useEffect(() => {
    if (death) setPlaying(false);
  }, [death]);

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

  /** The strongest mover among the medicines holds each organ's fill. */
  const levelsFrom = (
    pieces: Array<{ moment: ReturnType<typeof momentAt> }>,
    scale: { concMgPerL: number; eliminationMgPerH: number }
  ): Record<string, number> => {
    if (pieces.length === 0) return levelsFor(moment, scale);
    const per = pieces.map((p) => levelsFor(p.moment, scale));
    return Object.fromEntries(
      Object.keys(per[0]).map((key) => [key, Math.max(...per.map((l) => l[key] ?? 0))])
    ) as Record<string, number>;
  };

  const levels = React.useMemo(
    () => levelsFrom(breakdown, peaks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdown, peaks, moment]
  );

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
  /** An explicit pick in the monitor wins; otherwise the walkthrough's step
   *  drives the camera. Both live on screen at once below the 3D view. */
  const focusOrgan: FocusOrgan | null = monitorFocus ?? walkthroughFocus;

  React.useEffect(() => {
    scene?.focusOrgan(focusOrgan);
    scene?.setFocus(focusOrgan);
  }, [scene, focusOrgan]);

  /**
   * Picking an organ in the monitor fades the rest of the body so the organ
   * reads on its own. The walkthrough never hides the body — there the camera
   * is the instrument. The gut has no mesh, so it never isolates.
   */
  const isolation = monitorFocus !== "gut" ? monitorFocus : null;
  React.useEffect(() => {
    scene?.setIsolation(isolation);
  }, [scene, isolation]);

  React.useEffect(() => {
    scene?.setLevels(levels);
  }, [scene, levels]);

  React.useEffect(() => {
    scene?.setDead(Boolean(death));
  }, [scene, death]);

  /** Every procedure section, for the expanded full timeline. */
  const sections: TimelineSection[] = React.useMemo(() => {
    const last = steps.length - 1;
    return steps.map((step, index) => ({
      index,
      label: index === 0 ? "Whole body" : ORGAN_LABEL[step.organ as FocusOrgan] ?? String(step.organ),
      hour: last === 0 ? 0 : Number(((index / last) * active.tEndH).toFixed(1)),
    }));
  }, [steps, active.tEndH]);

  /** Jump the simulation — time and camera — to a procedure section. */
  const jumpToSection = React.useCallback(
    (index: number) => {
      setActiveStep(index);
      const section = sections[index];
      if (section) setHours(section.hour);
      const element = stepRefs.current[index];
      if (element) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        element.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }
    },
    [sections]
  );

  /** The small readout shown when the pointer rests on an organ in the model. */
  const hoverDataFor = React.useCallback(
    (organ: FocusOrgan) => {
      const toxic = runs?.[0]?.result.toxicity;
      const loadKey = organ as keyof NonNullable<typeof toxic>["organLoad"];
      const load = toxic?.organLoad[loadKey];
      return {
        title: ORGAN_LABEL[organ] ?? organ,
        lines: [
          `Relative level: ${((levels[organ] ?? 0) * 100).toFixed(0)}% of peak`,
          `Model time: T+${hours.toFixed(1)} h`,
          ...(load !== undefined ? [`Toxic load: ${load.toFixed(2)}x`] : []),
          ...(toxic?.failedOrgans.some((f) => f.organ === loadKey) ? ["Organ failed in this run"] : []),
        ],
      };
    },
    [levels, hours, runs]
  );

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

  // Play: the dial advances on its own and loops. Speed is shared with the
  // timeline bar; the play loop never runs once the model has failed.
  React.useEffect(() => {
    if (!playing || death) return;
    const id = window.setInterval(() => {
      setHours((h) => {
        const step = Math.max(0.05, active.tEndH / 240) * speed;
        const next = h + step;
        return next > active.tEndH ? 0 : next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [playing, active.tEndH, speed, death]);

  /* ---- running and saving --------------------------------------------- */

  const run = React.useCallback(() => {
    // Empty boxes become 0 and show 0 from this moment on — the only time the
    // form is rewritten, and it happens on Run rather than on blur/change.
    const resolved = normalizeInput(draft);
    setDraft(resolved);
    setActive(resolved);
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
        const amount = Number(r.doseMg) || 0;
        const time = Number(r.timeH) || 0;
        const times = byAmount.get(amount) ?? [];
        times.push(time);
        byAmount.set(amount, times);
      }
      return [...byAmount.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([doseMg, times]) => ({
          drugId: line.drugId,
          doseMg,
          times: [...new Set(times)].sort((a, b) => a - b),
        }));
    });

    const scenario = scenarioById(active.clearanceScenario);
    const scenarioLine =
      active.clearanceScenario === "baseline"
        ? `Model setting: ${scenario.label} (cited clearance, unchanged).`
        : `Model what-if: ${scenario.label} (clearance x${scenario.multiplier}). ${SCENARIO_CONTEXT}`;

    const perMedicine = reports.map(({ run, report }) => {
      const comparison = run.baseline
        ? ` What-if vs cited baseline: ${compareRuns(run.result, run.baseline)
            .map((row) => `${row.label} ${row.baseline} -> ${row.scenario}`)
            .join("; ")}.`
        : "";
      return `${run.name}: ${report.bullets.join("; ")}${comparison}`;
    });
    const summaryText = [
      scenarioLine,
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
        ageYears: toNumber(active.ageYears, 30),
        weightKg: toNumber(active.weightKg, 70),
        sex: active.sex,
      },
      drugs,
      metrics: {
        cmaxMgPerL: first.cmaxMgPerL,
        tmaxH: first.tmaxH,
        timeToClearH: first.timeToClearH,
        modelScenario: { id: scenario.id, clearanceMultiplier: scenario.multiplier },
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
      ageYears: toNumber(draft.ageYears, 30),
      weightKg: toNumber(draft.weightKg, 70),
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
        <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-3">
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
          {/* The theme switch sits beside the amber note, not over the page. */}
          <div className="flex items-center gap-3">
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
            <ThemeSwitch variant="inline" />
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid w-full grid-cols-1 gap-5 px-4 pt-5 xl:grid-cols-[330px_minmax(0,1fr)] xl:gap-6">
        {/* ---- the model, in the middle ---- */}
        <section
          aria-label="The anatomy"
          className="sim-rise order-1 flex flex-col gap-3 xl:order-2 xl:sticky xl:top-[84px] xl:h-[calc(100svh-140px)]"
          style={rise(80)}
        >
          {/* The timeline sits at the top of the model, small and always in reach. */}
          <div className="sim-rise rounded-[10px] border border-line bg-surface/60 px-2.5 py-1.5" style={rise(40)}>
            <TimeDial
              maxH={active.tEndH}
              hours={hours}
              onHours={handleHours}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              speed={speed}
              onSpeedChange={setSpeed}
              fullOpen={fullTimelineOpen}
              onToggleFull={() => setFullTimelineOpen((open) => !open)}
              sections={sections}
              onJumpToSection={jumpToSection}
              activeSection={activeStep}
              tmaxH={single ? single.result.tmaxH : null}
              disabled={Boolean(death)}
            />
          </div>

          <div className="hud-corners relative min-h-[40svh] flex-1 overflow-hidden rounded-[12px] border border-line bg-page/40 xl:min-h-0">
            <BodyFigure
              scene={scene}
              focus={focusOrgan}
              focusLabel={focusOrgan ? ORGAN_LABEL[focusOrgan] : null}
              onScene={setScene}
              onBrainRegion={setBrainRegion}
              organData={hoverDataFor}
              dead={Boolean(death)}
              deathMessage={death?.message ?? null}
            />
            {/* The scanner sweep, the same one the landing figure has. */}
            {death ? null : <div className="hud-scan" aria-hidden="true" />}
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

          <p className="font-mono text-[10px] uppercase leading-4 tracking-[0.1em] text-ink-3">
            Dial moves time · scroll moves the camera · hover an organ for its data
          </p>

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

      </div>{/* the top row ends here — everything below is reached by scrolling */}

      {/* ---- the graphs and the written experiment, below the 3D model ---- */}
      <section
        aria-label="Experiment graphs and details"
        className="relative mx-auto w-full px-4 pb-24 pt-6"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3 border-t border-line pt-5">
          <h2 className="font-heading text-[15px] font-semibold uppercase tracking-[0.18em] text-ink">
            Experiment — graphs and details
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Scroll to explore
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* The healthy reference stays as a graph, beside this model's curves. */}
          <div
            id="experiment-graphs"
            className="h-fit overflow-hidden rounded-[10px] border border-line bg-surface/40 xl:sticky xl:top-[84px]"
          >
            <OrganMonitor
              runs={runs}
              healthyRuns={healthyRuns}
              hours={hours}
              focus={monitorFocus}
              onToggleFocus={(organ) => setMonitorFocus(organ)}
              organProfiles={active.organProfiles}
              dead={Boolean(death)}
            />
          </div>

          {/* Live body status, the narrated walkthrough and engine summaries. */}
          <div>
          <h2 className="sr-only">The walkthrough</h2>

          {/* The walkthrough opens with a live status update of the whole body. */}
          <section
            aria-label="Current body status"
            className="mb-6 rounded-[10px] border border-line bg-surface/50 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Body status · live
              </p>
              <p className="font-mono text-[11px] tabular-nums text-brand-text">
                T+{hours.toFixed(1)} h
              </p>
            </div>
            {death ? (
              <p role="alert" className="mt-2 rounded-[6px] border border-rose-500/50 bg-rose-500/10 px-2.5 py-2 text-[12px] leading-5 text-rose-300">
                {death.message}
              </p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: "Concentration", value: `${moment.concMgPerL.toFixed(3)} mg/L` },
                { label: "In the gut", value: `${moment.gutMg.toFixed(1)} mg` },
                { label: "In the blood", value: `${moment.bodyMg.toFixed(1)} mg` },
                { label: "Clearing", value: `${moment.eliminationMgPerH.toFixed(2)} mg/h` },
              ].map((item) => (
                <div key={item.label} className="rounded-[8px] border border-line bg-page/50 px-2.5 py-2">
                  <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 font-mono text-[14px] tabular-nums text-brand-text">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            {breakdown.length > 1 ? (
              <p className="mt-2 text-[11px] leading-4 text-ink-3">
                {breakdown.map((b) => b.name).join(" · ")} — each medicine is modelled separately.
              </p>
            ) : null}

            {/* Selecting an organ in the monitor shows its data beside this panel. */}
            {monitorFocus ? (
              <div className="mt-3 rounded-[8px] border border-brand/40 bg-brand/5 px-2.5 py-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-brand-text">
                  Selected organ · {ORGAN_LABEL[monitorFocus]}
                </p>
                <p className="mt-1 font-mono text-[12px] tabular-nums text-ink">
                  {hoverDataFor(monitorFocus).lines.join(" · ")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const graph = document.getElementById("experiment-graphs");
                    if (!graph) return;
                    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    graph.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                  }}
                  className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  See its graph beside the healthy reference →
                </button>
              </div>
            ) : null}
          </section>

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
        </div>
      </section>
    </div>
  );
}

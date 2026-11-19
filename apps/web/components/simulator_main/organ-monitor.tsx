"use client";

/**
 * The organ monitor: every organ on one screen, live, while the model runs.
 *
 * The walkthrough (the other tab) follows one organ at a time down the
 * engine's story. The monitor is the instrument panel: it shows the state of
 * every organ at the hour the dial is on, and a trace of that state across
 * the run, so a visitor can watch each one change as the dose moves.
 *
 * When healthy reference runs are supplied, each row also carries the trace
 * of the same inputs through a healthy organ profile set, so the model's
 * response can be read side by side with the reference.
 *
 * What each bar means, in the model's own terms, is on the row — the engine
 * has one blood compartment and one clearance, so the brain is not exposure
 * and the liver and kidneys are the same clearance seen from two ends. The
 * words say that rather than implying more.
 *
 * Clicking a row moves the camera to that organ; clicking it again brings the
 * whole body back. The fill follows the strongest mover among the medicines —
 * the same rule the body shading uses — and the traces are per medicine.
 */

import { Fragment, useMemo } from "react";
import type { FocusOrgan } from "./scene";
import type { SimResult } from "@dib/engine";
import type { MedicationRun } from "@/lib/treatment";
import {
  getHeartProfile,
  getKidneyProfile,
  getLiverProfile,
  getLungProfile,
  computeHeartDynamic,
  computeKidneyDynamic,
  computeLiverDynamic,
  computeLungDynamic,
  type OrganProfileSelection,
} from "@dib/engine";

type Trace = { tH: number[]; conc: number[]; gut: number[]; elim: number[] };

/** The three raw quantities the model and the healthy reference are compared on. */
type MonitorPeaks = {
  concMgPerL: number;
  eliminationMgPerH: number;
  gutMg: number;
};

export type OrganMonitorProps = {
  runs: MedicationRun[] | null;
  /** The hour the dial is on, so the playheads and bars track time. */
  hours: number;
  /** Which organ the camera is on, or null for the whole body. */
  focus: FocusOrgan | null;
  onToggleFocus: (organ: FocusOrgan | null) => void;
  organProfiles?: OrganProfileSelection;
  /** Same inputs as `runs`, but simulated with healthy organ profiles. */
  healthyRuns?: MedicationRun[] | null;
  /** Whether the simulated model failed from toxicity during the run. */
  dead?: boolean;
};

const TRACE_W = 132;
const TRACE_H = 36;
const MAX_TRACE_SAMPLES = 120;

/** Down-sample a series to a max number of points for the trace. */
function decimate(values: number[], limit: number): number[] {
  if (values.length <= limit) return values;
  const stride = (values.length - 1) / (limit - 1);
  const out: number[] = [];
  for (let i = 0; i < limit; i += 1) out.push(values[Math.round(i * stride)]);
  return out;
}

/** The per-sample max over every medicine's series, for the combined fill. */
function pickAtMax(traces: Trace[], pick: (trace: Trace) => number[]): number[] {
  const first = pick(traces[0]);
  const out = new Array(first.length).fill(0);
  for (const trace of traces) {
    const values = pick(trace);
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] > out[i]) out[i] = values[i];
    }
  }
  return out;
}

/**
 * A polyline scaled to fit the trace box, y down.
 *
 * `scalePeak` is optional. On its own a trace is normalised against its own
 * peak, which is fine for a single run but hides every difference between two
 * curves that have the same shape at a different size. In a model/healthy
 * comparison we pass one shared peak for both, so a genuinely higher curve
 * really is drawn higher.
 */
export function tracePath(values: number[], scalePeak?: number): string {
  if (values.length < 2) return "";
  const peak = scalePeak && scalePeak > 1e-9 ? scalePeak : Math.max(...values, 1e-9);
  const step = TRACE_W / (values.length - 1);
  return values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(TRACE_H - 2 - (v / peak) * (TRACE_H - 4)).toFixed(1)}`
    )
    .join(" ");
}

/** The nearest sample index to t. */
function nearestIndex(tH: number[], hours: number): number {
  let index = 0;
  let best = Infinity;
  for (let i = 0; i < tH.length; i += 1) {
    const delta = Math.abs(tH[i] - hours);
    if (delta < best) {
      best = delta;
      index = i;
    }
  }
  return index;
}

/** The series for one organ of one run, for its trace. */
function seriesFor(trace: Trace, organ: FocusOrgan): number[] {
  switch (organ) {
    case "gut":
      return trace.gut;
    case "liver":
    case "kidneys":
      return trace.elim;
    default:
      return trace.conc;
  }
}

type OrganMetric = {
  organ: FocusOrgan;
  label: string;
  /** One line, plain, on what this number is in the model. */
  basis: string;
  archetype?: {
    label: string;
    stage: string;
    basis: string;
    params: { name: string; val: string; live?: boolean; delta?: string }[];
  };
  /** Traces per medicine — one line each. */
  traces: number[][];
  /** A fixed y-scale shared with the reference, when one is being compared. */
  traceScale?: number;
  /** The current value at the dial's hour, and the fill 0-1. */
  now: (index: number) => { value: string; fill: number };
};

type MonitorProfiles = {
  heart: ReturnType<typeof getHeartProfile>;
  kidney: ReturnType<typeof getKidneyProfile>;
  liver: ReturnType<typeof getLiverProfile>;
  lung: ReturnType<typeof getLungProfile>;
};

/**
 * Derive traces, peaks and per-organ metrics for one set of runs.
 *
 * The same logic builds the model's numbers and the healthy reference's
 * numbers; only the runs and the organ profiles differ. `index` is shared so
 * both sets are read at the same point in time. When `sharedPeaks` is passed,
 * both sets normalise against the same maxima and draw on the same y-scale —
 * otherwise each set is auto-scaled to its own peak, which hides differences.
 */
function buildMonitorData(
  runs: MedicationRun[] | null,
  profiles: MonitorProfiles,
  index: number,
  sharedPeaks?: MonitorPeaks | null
): { traces: Trace[] | null; metrics: OrganMetric[] | null } {
  const traces: Trace[] | null =
    runs?.map((r) => ({
      tH: r.result.tH,
      conc: r.result.concMgPerL,
      gut: r.result.gutMg,
      elim: r.result.eliminationMgPerH,
    })) ?? null;

  const peaks: MonitorPeaks | null = (() => {
    if (sharedPeaks) return sharedPeaks;
    if (!runs || runs.length === 0) return null;
    const max = (fn: (r: SimResult) => number[]) =>
      Math.max(...runs.map((r) => Math.max(...fn(r.result), 0)));
    return {
      concMgPerL: max((r) => r.concMgPerL),
      eliminationMgPerH: max((r) => r.eliminationMgPerH),
      gutMg: max((r) => r.gutMg),
    };
  })();

  const metrics: OrganMetric[] | null = (() => {
    if (!traces || !peaks || !runs) return null;
    const { heart: heartProfile, kidney: kidneyProfile, liver: liverProfile, lung: lungProfile } = profiles;
    const per = (pick: (trace: Trace) => number[]) =>
      traces.map((tr) => decimate(pick(tr), MAX_TRACE_SAMPLES));

    const blood = per((tr) => tr.conc);
    const gut = per((tr) => tr.gut);
    const elim = per((tr) => tr.elim);

    const heartTraces = traces.map((tr) =>
      decimate(
        tr.conc.map((c) => computeHeartDynamic(heartProfile, c, peaks.concMgPerL).stress),
        MAX_TRACE_SAMPLES
      )
    );
    const kidneyTraces = traces.map((tr) =>
      decimate(
        tr.conc.map((c) => computeKidneyDynamic(kidneyProfile, c, peaks.concMgPerL).stress),
        MAX_TRACE_SAMPLES
      )
    );
    const liverTraces = traces.map((tr) =>
      decimate(
        tr.elim.map((e) => computeLiverDynamic(liverProfile, e, peaks.eliminationMgPerH).stress),
        MAX_TRACE_SAMPLES
      )
    );
    const lungTraces = traces.map((tr) =>
      decimate(
        tr.conc.map((c) => computeLungDynamic(lungProfile, c, peaks.concMgPerL).stress),
        MAX_TRACE_SAMPLES
      )
    );

    // One combined fill, from the strongest mover — same rule as the shading.
    const combinedFill = (pick: (trace: Trace) => number[], peak: number) => (i: number) =>
      Math.min(1, pickAtMax(traces, pick)[i] / Math.max(peak, 1e-9));
    const value = (pick: (trace: Trace) => number[]) => (i: number) =>
      Math.max(...traces.map((tr) => pick(tr)[i] ?? 0));

    const bloodFill = combinedFill((tr) => tr.conc, peaks.concMgPerL);
    const gutFill = combinedFill((tr) => tr.gut, peaks.gutMg);
    const elimFill = combinedFill((tr) => tr.elim, peaks.eliminationMgPerH);
    const bloodValue = value((tr) => tr.conc);
    const gutValue = value((tr) => tr.gut);
    const elimValue = value((tr) => tr.elim);

    const currConc = bloodValue(index);
    const currElim = elimValue(index);

    const heartDyn = computeHeartDynamic(heartProfile, currConc, peaks.concMgPerL);
    const kidneyDyn = computeKidneyDynamic(kidneyProfile, currConc, peaks.concMgPerL);
    const liverDyn = computeLiverDynamic(liverProfile, currElim, peaks.eliminationMgPerH);
    const lungDyn = computeLungDynamic(lungProfile, currConc, peaks.concMgPerL);

    return [
      {
        organ: "brain" as FocusOrgan,
        label: "Brain",
        basis: "blood reaching the brain — the model has no brain compartment and no barrier",
        traces: blood,
        traceScale: sharedPeaks ? sharedPeaks.concMgPerL : undefined,
        now: () => ({
          value: `${bloodValue(index).toFixed(2)} mg/L`,
          fill: bloodFill(index),
        }),
      },
      {
        organ: "heart" as FocusOrgan,
        label: "Heart",
        basis: "cardiac response under circulating drug exposure — heart rate, contractility, and conduction/QT sensitivity",
        archetype: {
          label: heartProfile.label,
          stage: heartProfile.nyha_class !== "none" ? `NYHA Class ${heartProfile.nyha_class}` : "Healthy Baseline",
          basis: heartProfile.basis,
          params: [
            {
              name: "Heart Rate",
              val: `${heartDyn.currentHr} bpm`,
              live: true,
              delta: heartDyn.deltaHr !== 0 ? `${heartDyn.deltaHr > 0 ? "+" : ""}${heartDyn.deltaHr}` : undefined,
            },
            {
              name: "QT Interval",
              val: `${heartDyn.currentQt} ms`,
              live: true,
              delta: heartDyn.deltaQt !== 0 ? `+${heartDyn.deltaQt}` : undefined,
            },
            {
              name: "LVEF",
              val: `${heartDyn.currentLvef}%`,
              live: true,
              delta: heartDyn.deltaLvef !== 0 ? `${heartDyn.deltaLvef}%` : undefined,
            },
            {
              name: "Cardiac Output",
              val: `${heartDyn.currentCo} L/min`,
              live: true,
            },
            { name: "Mean Arterial BP", val: `${heartProfile.mean_arterial_pressure_mmhg} mmHg` },
            { name: "Cardiotoxic Sens.", val: `${heartProfile.cardiotoxic_sensitivity_multiplier}x` },
          ],
        },
        traces: heartTraces,
        // Stress is already 0-1 against the shared exposure peak; scale 1
        // keeps absolute differences visible instead of re-normalising.
        traceScale: sharedPeaks ? 1 : undefined,
        now: () => ({
          value: `${heartDyn.currentHr} bpm`,
          fill: heartDyn.stress,
        }),
      },
      {
        organ: "lungs" as FocusOrgan,
        label: "Lungs",
        basis: "pulmonary gas exchange and airway response — SpO2 saturation, airway resistance, and respiratory drive",
        archetype: {
          label: lungProfile.label,
          stage: lungProfile.smoking_status === "never" ? "Non-smoker" : `${lungProfile.pack_years} pack-years`,
          basis: lungProfile.basis,
          params: [
            {
              name: "SpO2 Saturation",
              val: `${lungDyn.currentSpo2}%`,
              live: true,
              delta: lungDyn.deltaSpo2 !== 0 ? `${lungDyn.deltaSpo2}%` : undefined,
            },
            {
              name: "Respiratory Rate",
              val: `${lungDyn.currentRr} bpm`,
              live: true,
              delta: lungDyn.deltaRr !== 0 ? `+${lungDyn.deltaRr}` : undefined,
            },
            {
              name: "Airway Resistance",
              val: `${lungDyn.currentAirwayResist}x`,
              live: true,
            },
            { name: "FEV1 % pred", val: `${lungProfile.fev1_pct_predicted}%` },
            { name: "FEV1 / FVC", val: `${lungProfile.fev1_fvc_ratio}` },
            { name: "DLCO % pred", val: `${lungProfile.dlco_pct_predicted}%` },
          ],
        },
        traces: lungTraces,
        traceScale: sharedPeaks ? 1 : undefined,
        now: () => ({
          value: `${lungDyn.currentSpo2}% SpO2`,
          fill: lungDyn.stress,
        }),
      },
      {
        organ: "liver" as FocusOrgan,
        label: "Liver",
        basis: "hepatic clearance and enzyme workload — active metabolic rate against functional CYP450 capacity",
        archetype: {
          label: liverProfile.label,
          stage: liverProfile.child_pugh_class !== "none" ? `Child-Pugh ${liverProfile.child_pugh_class}` : "Normal Hepatic Function",
          basis: liverProfile.basis,
          params: [
            {
              name: "ALT (SGPT)",
              val: `${liverDyn.currentAlt} U/L`,
              live: true,
              delta: liverDyn.deltaAlt !== 0 ? `+${liverDyn.deltaAlt}` : undefined,
            },
            {
              name: "AST (SGOT)",
              val: `${liverDyn.currentAst} U/L`,
              live: true,
              delta: liverDyn.deltaAst !== 0 ? `+${liverDyn.deltaAst}` : undefined,
            },
            {
              name: "Metabolic Load",
              val: `${liverDyn.workloadPct}%`,
              live: true,
            },
            { name: "Total Bilirubin", val: `${liverProfile.total_bilirubin_mg_dl} mg/dL` },
            { name: "Clearance Scale", val: `${(liverProfile.clearance_scaling_factor * 100).toFixed(0)}%` },
            { name: "Hepatotoxic Sens.", val: `${liverProfile.hepatotoxic_sensitivity_multiplier}x` },
          ],
        },
        traces: liverTraces,
        traceScale: sharedPeaks ? 1 : undefined,
        now: () => ({
          value: `${liverDyn.currentAlt} U/L`,
          fill: liverDyn.stress,
        }),
      },
      {
        organ: "kidneys" as FocusOrgan,
        label: "Kidneys",
        basis: "renal filtration and drug excretion — glomerular filtration rate (eGFR) and nephrotoxic filtration strain",
        archetype: {
          label: kidneyProfile.label,
          stage: kidneyProfile.ckd_stage,
          basis: kidneyProfile.basis,
          params: [
            {
              name: "eGFR Filtration",
              val: `${kidneyDyn.currentEgfr} mL/min`,
              live: true,
              delta: kidneyDyn.deltaEgfr !== 0 ? `${kidneyDyn.deltaEgfr}` : undefined,
            },
            {
              name: "Serum Creatinine",
              val: `${kidneyDyn.currentCr} mg/dL`,
              live: true,
              delta: kidneyDyn.deltaCr !== 0 ? `+${kidneyDyn.deltaCr}` : undefined,
            },
            { name: "BUN", val: `${kidneyProfile.bun_mg_dl} mg/dL` },
            { name: "Urine ACR", val: `${kidneyProfile.urine_acr_mg_g} mg/g` },
            { name: "Clearance Scale", val: `${(kidneyProfile.clearance_scaling_factor * 100).toFixed(0)}%` },
            { name: "Nephrotoxic Sens.", val: `${kidneyProfile.nephrotoxic_sensitivity_multiplier}x` },
          ],
        },
        traces: kidneyTraces,
        traceScale: sharedPeaks ? 1 : undefined,
        now: () => ({
          value: `${kidneyDyn.currentEgfr} mL/m`,
          fill: kidneyDyn.stress,
        }),
      },
      {
        organ: "gut" as FocusOrgan,
        label: "Gut",
        basis: "left in the gut — the depot drains as it absorbs; not part of the modelled compartments",
        traces: gut,
        traceScale: sharedPeaks ? sharedPeaks.gutMg : undefined,
        now: () => ({
          value: `${gutValue(index).toFixed(1)} mg`,
          fill: gutFill(index),
        }),
      },
    ];
  })();

  return { traces, metrics };
}

/** Baseline, one line per medicine, and the playhead — used by every trace. */
function TraceSvg({
  traces,
  position,
  strokeFor,
  scalePeak,
  showPlayhead = true,
  className = "mt-1.5",
}: {
  traces: number[][];
  position: number;
  strokeFor: (i: number) => { stroke: string; opacity?: number };
  scalePeak?: number;
  /** The moving time marker belongs to the model trace, not the reference. */
  showPlayhead?: boolean;
  /** Overridden when the trace is laid out beside its level bar. */
  className?: string;
}) {
  return (
    <svg viewBox={`0 0 ${TRACE_W} ${TRACE_H}`} className={`${className} h-[36px] w-full`} aria-hidden="true">
      <line
        x1={0}
        x2={TRACE_W}
        y1={TRACE_H - 1}
        y2={TRACE_H - 1}
        stroke="var(--line)"
        strokeWidth={1}
      />
      {traces.map((trace, i) => {
        const { stroke, opacity } = strokeFor(i);
        return (
          <path
            key={i}
            d={tracePath(trace, scalePeak)}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            opacity={opacity}
          />
        );
      })}
      {showPlayhead ? (
        <line
          x1={position * TRACE_W}
          x2={position * TRACE_W}
          y1={2}
          y2={TRACE_H - 2}
          stroke="var(--accent-fill)"
          strokeWidth={1}
          opacity={0.7}
        />
      ) : null}
    </svg>
  );
}

/**
 * The concentration-intensity bar. It stands beside the model's trace, not
 * above the graph section, and never appears on the healthy reference.
 */
export function IntensityBar({ fill }: { fill: number }) {
  // A definite height on a bottom-anchored child avoids the zero-height trap
  // a transform-scaled absolute child falls into when it has no `top`.
  const height = Math.max(2, Math.min(100, fill * 100)).toFixed(1);
  return (
    <span
      className="relative block h-[36px] w-[6px] shrink-0 overflow-hidden rounded-full bg-line-strong/60"
      aria-hidden="true"
    >
      <span
        className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-brand/40 to-brand transition-[height] duration-150 motion-reduce:transition-none"
        style={{ height: `${height}%` }}
      />
    </span>
  );
}

/** The model trace with its level bar immediately beside it. */
function ModelTrace({
  traces,
  position,
  scalePeak,
  fill,
}: {
  traces: number[][];
  position: number;
  scalePeak?: number;
  fill: number;
}) {
  return (
    <span className="mt-1.5 flex items-end gap-1.5">
      <IntensityBar fill={fill} />
      <span className="min-w-0 flex-1">
        <TraceSvg
          traces={traces}
          position={position}
          scalePeak={scalePeak}
          className=""
          strokeFor={(i) => ({ stroke: "var(--accent-fill)", opacity: i === 0 ? 1 : 0.5 })}
        />
      </span>
    </span>
  );
}

/** The reference trace: a matching gap, but no bar and no playhead. */
function HealthyTrace({
  traces,
  position,
  scalePeak,
}: {
  traces: number[][];
  position: number;
  scalePeak?: number;
}) {
  return (
    <span className="mt-1.5 flex items-end gap-1.5">
      <span className="block h-[36px] w-[6px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <TraceSvg
          traces={traces}
          position={position}
          scalePeak={scalePeak}
          showPlayhead={false}
          className=""
          strokeFor={(i) => ({ stroke: "#22c55e", opacity: i === 0 ? 1 : 0.5 })}
        />
      </span>
    </span>
  );
}

type ComparisonRow = {
  name: string;
  model: string;
  modelDelta?: string;
  healthy: string;
  healthyDelta?: string;
};

/** Parameter names shared by both columns, aligned for the comparison panel. */
function comparisonRows(model: OrganMetric, healthy: OrganMetric, index: number): ComparisonRow[] {
  const modelParams = model.archetype?.params ?? [];
  const healthyParams = healthy.archetype?.params ?? [];
  if (modelParams.length === 0 && healthyParams.length === 0) {
    return [
      {
        name: "Value at dial hour",
        model: model.now(index).value,
        healthy: healthy.now(index).value,
      },
    ];
  }
  const names = Array.from(
    new Set([...modelParams.map((p) => p.name), ...healthyParams.map((p) => p.name)])
  );
  return names.map((name) => {
    const m = modelParams.find((p) => p.name === name);
    const h = healthyParams.find((p) => p.name === name);
    return {
      name,
      model: m?.val ?? "—",
      modelDelta: m?.delta,
      healthy: h?.val ?? "—",
      healthyDelta: h?.delta,
    };
  });
}

export default function OrganMonitor({
  runs,
  healthyRuns,
  hours,
  focus,
  onToggleFocus,
  organProfiles,
  dead,
}: OrganMonitorProps) {
  const userProfiles = useMemo<MonitorProfiles>(
    () => ({
      heart: getHeartProfile(organProfiles?.heartId),
      kidney: getKidneyProfile(organProfiles?.kidneyId),
      liver: getLiverProfile(organProfiles?.liverId),
      lung: getLungProfile(organProfiles?.lungId),
    }),
    [
      organProfiles?.heartId,
      organProfiles?.kidneyId,
      organProfiles?.liverId,
      organProfiles?.lungId,
    ]
  );

  const healthyProfiles = useMemo<MonitorProfiles>(
    () => ({
      heart: getHeartProfile(),
      kidney: getKidneyProfile(),
      liver: getLiverProfile(),
      lung: getLungProfile(),
    }),
    []
  );

  const tEndH = runs && runs.length > 0 ? runs[0].result.tH[runs[0].result.tH.length - 1] : 0;
  const position = tEndH > 0 ? Math.min(1, Math.max(0, hours / tEndH)) : 0;
  const index = runs && runs.length > 0 ? nearestIndex(runs[0].result.tH, hours) : 0;

  /**
   * One scale for both sets. Taking each set's peaks on its own is what made
   * a higher model curve look identical to the healthy one: each was stretched
   * to fill the same little box. The union of both sets gives an honest scale.
   */
  const sharedPeaks = useMemo<MonitorPeaks | null>(() => {
    if (!healthyRuns || !runs) return null;
    const all = [...runs, ...healthyRuns];
    if (all.length === 0) return null;
    const max = (fn: (r: SimResult) => number[]) =>
      Math.max(...all.map((r) => Math.max(...fn(r.result), 0)));
    return {
      concMgPerL: max((r) => r.concMgPerL),
      eliminationMgPerH: max((r) => r.eliminationMgPerH),
      gutMg: max((r) => r.gutMg),
    };
  }, [runs, healthyRuns]);

  const { metrics } = useMemo(
    () => buildMonitorData(runs, userProfiles, index, sharedPeaks),
    [runs, userProfiles, index, sharedPeaks]
  );
  const { metrics: healthyMetrics } = useMemo(
    () =>
      healthyRuns
        ? buildMonitorData(healthyRuns, healthyProfiles, index, sharedPeaks)
        : { metrics: null },
    [healthyRuns, healthyProfiles, index, sharedPeaks]
  );

  /**
   * Only say the curves match when they really do: identical PK series *and*
   * identical organ archetypes. A different heart or lung profile changes its
   * own stress trace even when the blood curve is unchanged.
   */
  const curvesMatch = useMemo(() => {
    if (!healthyRuns || !runs || runs.length !== healthyRuns.length) return false;
    const sameProfiles =
      userProfiles.heart.profile_id === healthyProfiles.heart.profile_id &&
      userProfiles.kidney.profile_id === healthyProfiles.kidney.profile_id &&
      userProfiles.liver.profile_id === healthyProfiles.liver.profile_id &&
      userProfiles.lung.profile_id === healthyProfiles.lung.profile_id;
    if (!sameProfiles) return false;
    const series = [
      (r: SimResult) => r.concMgPerL,
      (r: SimResult) => r.gutMg,
      (r: SimResult) => r.eliminationMgPerH,
    ];
    for (let i = 0; i < runs.length; i += 1) {
      for (const pick of series) {
        const a = pick(runs[i].result);
        const b = pick(healthyRuns[i].result);
        if (a.length !== b.length) return false;
        for (let j = 0; j < a.length; j += 1) {
          if (Math.abs(a[j] - b[j]) > 1e-6) return false;
        }
      }
    }
    return true;
  }, [runs, healthyRuns, userProfiles, healthyProfiles]);

  if (!metrics) {
    return (
      <div className="flex flex-col justify-center px-5 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Organ monitor
        </p>
        <p className="mt-3 max-w-[46ch] text-[14px] leading-6 text-ink-2">
          Add a medicine to build a treatment, then run it — each organ's trace shows the level
          the model carries at every hour.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Organ monitor — live
        </p>
        <p className="font-mono text-[11px] tabular-nums text-brand-text">
          T+{hours.toFixed(1)} h
        </p>
      </div>

      {healthyMetrics ? (
        <p className="font-mono text-[9px] leading-3 text-ink-3">
          {curvesMatch
            ? "These curves match: this run uses healthy organ profiles. Pick a condition or organ profile that changes clearance to see the two diverge."
            : "Model vs healthy reference — same inputs, one shared scale, healthy organ values."}
        </p>
      ) : null}

      {dead ? (
        <p role="status" className="font-mono text-[10px] leading-4 text-warn">
          Model failed — organ failure at this point in the run.
        </p>
      ) : null}

      {metrics.map((metric) => {
        const isOn = focus === metric.organ;
        const at = metric.now(index);
        const healthyMetric = healthyMetrics?.find((m) => m.organ === metric.organ) ?? null;
        return (
          <button
            key={metric.organ}
            type="button"
            onClick={() => onToggleFocus(isOn ? null : metric.organ)}
            aria-pressed={isOn}
            aria-label={`${isOn ? "Stop looking at" : "Look at"} the ${metric.label.toLowerCase()}`}
            className={`group grid grid-cols-[92px_minmax(0,1fr)_54px] items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
              isOn ? "border-brand/60 bg-brand/10" : "border-line bg-surface/40 hover:border-line-strong"
            }`}
          >
            <span className="min-w-0">
              <span
                className={`block font-mono text-[12px] uppercase tracking-[0.14em] transition-colors motion-reduce:transition-none ${
                  isOn ? "text-brand-text" : "text-ink"
                }`}
              >
                {metric.label}
              </span>
              <span className="mt-1 block font-mono text-[9px] leading-3 tracking-[0.08em] text-ink-3 truncate max-w-[90px]">
                {metric.organ === "gut"
                  ? "DRAINING"
                  : metric.archetype
                    ? metric.archetype.stage
                    : "SATURATION"}
              </span>
            </span>

            <span className="min-w-0">
              {healthyMetric ? (
                <span className="flex flex-wrap gap-x-2 gap-y-1">
                  <span className="min-w-[88px] flex-1 basis-0">
                    <span className="block font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3">
                      model
                    </span>
                    <ModelTrace
                      traces={metric.traces}
                      position={position}
                      scalePeak={metric.traceScale}
                      fill={at.fill}
                    />
                  </span>
                  <span className="min-w-[88px] flex-1 basis-0">
                    <span className="block font-mono text-[8px] uppercase tracking-[0.1em] text-[#22c55e]">
                      healthy
                    </span>
                    <HealthyTrace
                      traces={healthyMetric.traces}
                      position={position}
                      scalePeak={healthyMetric.traceScale}
                    />
                  </span>
                </span>
              ) : (
                <ModelTrace
                  traces={metric.traces}
                  position={position}
                  scalePeak={metric.traceScale}
                  fill={at.fill}
                />
              )}
            </span>

            <span className="text-right">
              <span className="block font-mono text-[13px] leading-4 tabular-nums text-ink">
                {at.value}
              </span>
            </span>
          </button>
        );
      })}

      {(() => {
        const focusedMetric = focus ? metrics.find((m) => m.organ === focus) : null;
        const focusedHealthy =
          focus && healthyMetrics ? healthyMetrics.find((m) => m.organ === focus) ?? null : null;
        return (
          <div className="rounded-[8px] border border-line bg-page/40 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
                {focusedMetric ? `Focused: ${focusedMetric.label}` : "Monitor Overview"}
              </p>
              {focusedMetric?.archetype ? (
                <span className="font-mono text-[9px] text-brand-text uppercase tracking-[0.1em]">
                  {focusedMetric.archetype.stage}
                </span>
              ) : null}
            </div>

            <p className="text-[11px] leading-4 text-ink-2">
              {focusedMetric
                ? focusedMetric.basis
                : "Levels are normalised against their own peak across the run; the gut's bar falls as it is absorbed. Click an organ to see it on its own — the rest of the body fades out — and again to bring the body back."}
            </p>

            {focusedMetric && focusedHealthy ? (
              <div className="pt-2 border-t border-line/60 space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
                    Parameter
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-brand-text text-right">
                    Model
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#22c55e] text-right">
                    Healthy reference
                  </span>
                </div>
                <p className="font-mono text-[8px] leading-3 text-ink-3">
                  Model: {focusedMetric.archetype?.label ?? focusedMetric.label} —{" "}
                  {focusedMetric.archetype?.stage ?? "no archetype"}
                  <br />
                  Healthy reference: {focusedHealthy.archetype?.label ?? focusedHealthy.label} —{" "}
                  {focusedHealthy.archetype?.stage ?? "healthy baseline"}
                </p>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-1 text-[10px] font-mono">
                  {comparisonRows(focusedMetric, focusedHealthy, index).map((row) => (
                    <Fragment key={row.name}>
                      <span className="text-ink-3">{row.name}</span>
                      <span className="text-right font-semibold text-ink whitespace-nowrap">
                        {row.model}
                        {row.modelDelta ? (
                          <span className="text-brand-text text-[9px] font-bold">
                            {" "}({row.modelDelta})
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right text-ink-2 whitespace-nowrap">
                        {row.healthy}
                        {row.healthyDelta ? (
                          <span className="text-[#22c55e] text-[9px]">
                            {" "}({row.healthyDelta})
                          </span>
                        ) : null}
                      </span>
                    </Fragment>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {focusedMetric.archetype ? (
                    <p className="text-[9px] text-ink-3 italic">
                      Basis: {focusedMetric.archetype.basis}
                    </p>
                  ) : (
                    <span />
                  )}
                  <span className="font-mono text-[9px] text-brand-text px-1.5 py-0.2 rounded border border-brand/40 bg-brand/10 whitespace-nowrap">
                    Live at T+{hours.toFixed(1)}h
                  </span>
                </div>
              </div>
            ) : focusedMetric?.archetype ? (
              <div className="pt-2 border-t border-line/60">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
                    Profile: {focusedMetric.archetype.label}
                  </p>
                  <span className="font-mono text-[9px] text-brand-text px-1.5 py-0.2 rounded border border-brand/40 bg-brand/10">
                    Live at T+{hours.toFixed(1)}h
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                  {focusedMetric.archetype.params.map((p) => (
                    <div key={p.name} className="flex justify-between items-center rounded bg-surface/60 px-1.5 py-1">
                      <span className="text-ink-3">{p.name}:</span>
                      <span className="font-semibold text-ink flex items-center gap-1">
                        {p.val}
                        {p.delta ? (
                          <span className="text-brand-text text-[9px] font-bold">
                            ({p.delta})
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[9px] text-ink-3 italic">
                  Basis: {focusedMetric.archetype.basis}
                </p>
              </div>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}

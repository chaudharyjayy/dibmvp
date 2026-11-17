"use client";

/**
 * The organ monitor: every organ on one screen, live, while the model runs.
 *
 * The walkthrough (the other tab) follows one organ at a time down the
 * engine's story. The monitor is the instrument panel: it shows the state of
 * every organ at the hour the dial is on, and a trace of that state across
 * the run, so a visitor can watch each one change as the dose moves.
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

import { useMemo } from "react";
import type { FocusOrgan } from "./scene";
import type { MedicationRun } from "@/lib/treatment";
import OrganChart, { formatValue, valueAt, type ChartSeries } from "./organ-chart";
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

export type OrganMonitorProps = {
  runs: MedicationRun[] | null;
  /** The hour the dial is on, so the playheads and bars track time. */
  hours: number;
  /** Which organ the camera is on, or null for the whole body. */
  focus: FocusOrgan | null;
  onToggleFocus: (organ: FocusOrgan | null) => void;
  organProfiles?: OrganProfileSelection;
};

/** Points drawn per trace: enough for the shape, few enough for six charts. */
const MAX_TRACE_SAMPLES = 140;

/** Index of the tallest sample — always kept when a curve is down-sampled. */
function peakIndexOf(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

/**
 * Uniform sample indices, plus the peak.
 *
 * Every series of one organ is decimated with the *same* indices, so the
 * medicines stay aligned in time and comparable in height. The peak index is
 * forced in so a narrow maximum is never skipped by the downsample.
 */
function sampleIndices(length: number, limit: number, peakIndex: number): number[] {
  if (length <= limit) return Array.from({ length }, (_, i) => i);
  const stride = (length - 1) / (limit - 1);
  const out = new Set<number>([peakIndex]);
  for (let i = 0; i < limit; i += 1) out.add(Math.round(i * stride));
  return [...out].sort((a, b) => a - b);
}

/** Down-sample a metric for drawing; the numbers on screen stay full-resolution. */
function decimateMetric(
  tH: number[],
  seriesValues: number[][],
  limit: number
): { tH: number[]; values: number[][] } {
  const combined = tH.map((_, i) => Math.max(...seriesValues.map((v) => v[i] ?? 0)));
  const idx = sampleIndices(tH.length, limit, peakIndexOf(combined));
  return {
    tH: idx.map((i) => tH[i]),
    values: seriesValues.map((vals) => idx.map((i) => vals[i])),
  };
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
  /** The quantity the row prints, e.g. "mg/L" — the same one the graph draws. */
  unit: string;
  precision: number;
  /** The organ's resting value, drawn as a dashed reference line. */
  baseline: number | null;
  /** Amounts that start at zero get a zero-based axis. */
  zeroBased: boolean;
  /** Decimated sample times, shared by every medicine's line. */
  tH: number[];
  /** One line per medicine, in this organ's own units. */
  series: ChartSeries[];
  /** Full-resolution value at an hour, across the treatment. */
  at: (hours: number) => number;
  /** The treatment's peak for this quantity, and when it happens. */
  peak: { value: number; at: number } | null;
  /** The row's headline number and bar fill at the dial's hour. */
  now: (hours: number) => { value: string; unit: string; fill: number };
};

export default function OrganMonitor({
  runs,
  hours,
  focus,
  onToggleFocus,
  organProfiles,
}: OrganMonitorProps) {
  const heartProfile = useMemo(() => getHeartProfile(organProfiles?.heartId), [organProfiles?.heartId]);
  const kidneyProfile = useMemo(() => getKidneyProfile(organProfiles?.kidneyId), [organProfiles?.kidneyId]);
  const liverProfile = useMemo(() => getLiverProfile(organProfiles?.liverId), [organProfiles?.liverId]);
  const lungProfile = useMemo(() => getLungProfile(organProfiles?.lungId), [organProfiles?.lungId]);
  const traces: Trace[] | null = useMemo(
    () =>
      runs?.map((r) => ({
        tH: r.result.tH,
        conc: r.result.concMgPerL,
        gut: r.result.gutMg,
        elim: r.result.eliminationMgPerH,
      })) ?? null,
    [runs]
  );

  const peaks = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const max = (pick: (run: MedicationRun) => number[]) =>
      Math.max(...runs.map((run) => Math.max(...pick(run), 0)));
    return {
      concMgPerL: max((r) => r.result.concMgPerL),
      eliminationMgPerH: max((r) => r.result.eliminationMgPerH),
      gutMg: max((r) => r.result.gutMg),
    };
  }, [runs]);

  /** The simulated window's end — the chart's x-axis limit. */
  const tEndH = traces && traces.length > 0 ? traces[0].tH[traces[0].tH.length - 1] : 0;

  const metrics: OrganMetric[] | null = useMemo(() => {
    if (!traces || !peaks || !runs || traces.length === 0) return null;
    const tAll = traces[0].tH;
    const concAt = (t: number) => Math.max(...traces.map((tr) => valueAt(tr.conc, tr.tH, t)));
    const elimAt = (t: number) => Math.max(...traces.map((tr) => valueAt(tr.elim, tr.tH, t)));
    const gutAt = (t: number) => Math.max(...traces.map((tr) => valueAt(tr.gut, tr.tH, t)));

    /**
     * One organ: the full-resolution series in that organ's own units, the
     * decimated copy the chart draws, and the headline number.
     *
     * `full` is the same quantity as `format` — never a stress index on the
     * chart while the row prints bpm.
     */
    const build = (
      organ: FocusOrgan,
      label: string,
      basis: string,
      unit: string,
      precision: number,
      baseline: number | null,
      zeroBased: boolean,
      full: number[][],
      fill: (t: number) => number,
      archetype?: OrganMetric["archetype"]
    ): OrganMetric => {
      const dec = decimateMetric(tAll, full, MAX_TRACE_SAMPLES);
      const combined = tAll.map((_, i) => Math.max(...full.map((v) => v[i] ?? 0)));
      const peakIdx = peakIndexOf(combined);
      const peakValue = Math.max(...full.map((v) => Math.max(...v)));
      const at = (t: number) => Math.max(...full.map((v) => valueAt(v, tAll, t)));
      return {
        organ,
        label,
        basis,
        archetype,
        unit,
        precision,
        baseline,
        zeroBased,
        tH: dec.tH,
        series: dec.values.map((values, i) => ({
          id: runs[i].id,
          name: runs[i].name,
          color: runs[i].color,
          values,
        })),
        at,
        peak: Number.isFinite(peakValue) ? { value: peakValue, at: tAll[peakIdx] } : null,
        // A magnitude and its unit, side by side: the number is what changes.
        now: (t: number) => ({ value: formatValue(at(t), precision), unit, fill: fill(t) }),
      };
    };

    /** Bar fill: share of this organ's peak, never above 1. */
    const share = (value: number, peak: number) =>
      peak > 1e-9 ? Math.min(1, Math.max(0, value / peak)) : 0;

    const heartFull = traces.map((tr) =>
      tr.conc.map((c) => computeHeartDynamic(heartProfile, c, peaks.concMgPerL).currentHr)
    );
    const kidneyFull = traces.map((tr) =>
      tr.conc.map((c) => computeKidneyDynamic(kidneyProfile, c, peaks.concMgPerL).currentEgfr)
    );
    const liverFull = traces.map((tr) =>
      tr.elim.map((e) => computeLiverDynamic(liverProfile, e, peaks.eliminationMgPerH).currentAlt)
    );
    const lungFull = traces.map((tr) =>
      tr.conc.map((c) => computeLungDynamic(lungProfile, c, peaks.concMgPerL).currentSpo2)
    );

    // The organ parameters at the dial's hour.
    const heartDyn = computeHeartDynamic(heartProfile, concAt(hours), peaks.concMgPerL);
    const kidneyDyn = computeKidneyDynamic(kidneyProfile, concAt(hours), peaks.concMgPerL);
    const liverDyn = computeLiverDynamic(liverProfile, elimAt(hours), peaks.eliminationMgPerH);
    const lungDyn = computeLungDynamic(lungProfile, concAt(hours), peaks.concMgPerL);

    return [
      build(
        "brain",
        "Brain",
        "blood reaching the brain — the model has no brain compartment and no barrier",
        "mg/L",
        2,
        null,
        true,
        traces.map((tr) => tr.conc),
        (t) => share(concAt(t), peaks.concMgPerL)
      ),
      build(
        "heart",
        "Heart",
        "cardiac response under circulating drug exposure — heart rate, contractility, and conduction/QT sensitivity",
        "bpm",
        0,
        heartProfile.resting_heart_rate_bpm,
        false,
        heartFull,
        (t) => computeHeartDynamic(heartProfile, concAt(t), peaks.concMgPerL).stress,
        {
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
        }
      ),
      build(
        "lungs",
        "Lungs",
        "pulmonary gas exchange and airway response — SpO2 saturation, airway resistance, and respiratory drive",
        "%",
        0,
        lungProfile.spo2_rest_pct,
        false,
        lungFull,
        (t) => computeLungDynamic(lungProfile, concAt(t), peaks.concMgPerL).stress,
        {
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
        }
      ),
      build(
        "liver",
        "Liver",
        "hepatic clearance and enzyme workload — active metabolic rate against functional CYP450 capacity",
        "U/L",
        0,
        liverProfile.alt_u_l,
        false,
        liverFull,
        (t) => computeLiverDynamic(liverProfile, elimAt(t), peaks.eliminationMgPerH).stress,
        {
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
        }
      ),
      build(
        "kidneys",
        "Kidneys",
        "renal filtration and drug excretion — glomerular filtration rate (eGFR) and nephrotoxic filtration strain",
        "mL/min",
        1,
        kidneyProfile.egfr_ml_min_1_73m2,
        false,
        kidneyFull,
        (t) => computeKidneyDynamic(kidneyProfile, concAt(t), peaks.concMgPerL).stress,
        {
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
        }
      ),
      build(
        "gut",
        "Gut",
        "left in the gut — the depot drains as it absorbs; not part of the modelled compartments",
        "mg",
        1,
        null,
        true,
        traces.map((tr) => tr.gut),
        (t) => share(gutAt(t), peaks.gutMg)
      ),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces, peaks, hours, runs, heartProfile, kidneyProfile, liverProfile, lungProfile]);

  if (!metrics) {
    return (
      <div className="flex h-full flex-col justify-center px-5 py-10">
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
    <div className="flex h-full flex-col gap-3 px-4 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Organ monitor — live
        </p>
        <p className="font-mono text-[11px] tabular-nums text-brand-text">
          T+{hours.toFixed(1)} h
        </p>
      </div>

      {metrics.map((metric) => {
        const isOn = focus === metric.organ;
        const at = metric.now(hours);
        return (
          <button
            key={metric.organ}
            type="button"
            onClick={() => onToggleFocus(isOn ? null : metric.organ)}
            aria-pressed={isOn}
            aria-label={`${isOn ? "Stop looking at" : "Look at"} the ${metric.label.toLowerCase()}`}
            title={`${metric.label}: ${at.value} ${at.unit} at T+${hours.toFixed(1)} h · modelled strain ${(at.fill * 100).toFixed(0)}%`}
            className={`group grid grid-cols-[88px_minmax(0,1fr)_60px] items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
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
              <span className="mt-1 block font-mono text-[9px] leading-3 tracking-[0.08em] text-ink-3 truncate max-w-[82px]">
                {metric.organ === "gut"
                  ? "DRAINING"
                  : metric.archetype
                    ? metric.archetype.stage
                    : "SATURATION"}
              </span>
            </span>

            <span className="min-w-0">
              <span className="relative block h-[6px] overflow-hidden rounded-full bg-line-strong/60">
                <span
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-brand/40 to-brand transition-transform duration-150 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${Math.max(0.02, at.fill).toFixed(3)})` }}
                />
              </span>
              <div className="mt-1.5">
                <OrganChart
                  compact
                  series={metric.series}
                  tH={metric.tH}
                  tEndH={tEndH}
                  hours={hours}
                  unit={metric.unit}
                  precision={metric.precision}
                  baseline={metric.baseline}
                  zeroBased={metric.zeroBased}
                  ariaLabel={`${metric.label} over the simulated window`}
                />
              </div>
            </span>

            <span className="text-right">
              <span className="block whitespace-nowrap font-mono text-[13px] leading-4 tabular-nums text-ink">
                {at.value}
              </span>
              <span className="mt-0.5 block whitespace-nowrap font-mono text-[8px] uppercase leading-3 tracking-[0.06em] text-ink-3">
                {at.unit}
              </span>
            </span>
          </button>
        );
      })}

      {(() => {
        const focusedMetric = focus ? metrics.find((m) => m.organ === focus) : null;
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
                : "Every trace is drawn in the unit printed beside it, on one shared scale per organ, so two medicines can be compared. The gut's bar falls as it is absorbed. Click an organ for its axes, its peak and a hover readout — and again to bring the body back."}
            </p>

            {focusedMetric ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {focusedMetric.series.map((line) => (
                    <span key={line.id} className="flex items-center gap-1 font-mono text-[9px] text-ink-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-[2px] w-3 rounded-full"
                        style={{ backgroundColor: line.color }}
                      />
                      {line.name}
                    </span>
                  ))}
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
                    {focusedMetric.unit}
                  </span>
                </div>

                <div className="rounded-[6px] border border-line/70 bg-surface/40 px-1.5 pt-1">
                  <OrganChart
                    series={focusedMetric.series}
                    tH={focusedMetric.tH}
                    tEndH={tEndH}
                    hours={hours}
                    unit={focusedMetric.unit}
                    precision={focusedMetric.precision}
                    baseline={focusedMetric.baseline}
                    zeroBased={focusedMetric.zeroBased}
                    ariaLabel={`${focusedMetric.label}: ${focusedMetric.unit} over ${tEndH.toFixed(0)} hours, one line per medicine`}
                  />
                </div>

                {focusedMetric.peak ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[9px] tabular-nums text-ink-3">
                    <span>
                      Peak{" "}
                      <span className="text-ink-2">
                        {formatValue(focusedMetric.peak.value, focusedMetric.precision)}{" "}
                        {focusedMetric.unit}
                      </span>{" "}
                      at T+{focusedMetric.peak.at.toFixed(1)} h
                    </span>
                    {focusedMetric.baseline != null ? (
                      <span>
                        · resting{" "}
                        {formatValue(focusedMetric.baseline, focusedMetric.precision)}{" "}
                        {focusedMetric.unit}
                      </span>
                    ) : null}
                    <span className="ml-auto">
                      now {formatValue(focusedMetric.at(hours), focusedMetric.precision)}{" "}
                      {focusedMetric.unit}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {focusedMetric?.archetype ? (
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

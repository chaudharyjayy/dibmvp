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
import type { SimResult } from "@dib/engine";
import type { MedicationRun } from "@/lib/treatment";

type Trace = { tH: number[]; conc: number[]; gut: number[]; elim: number[] };

export type OrganMonitorProps = {
  runs: MedicationRun[] | null;
  /** The hour the dial is on, so the playheads and bars track time. */
  hours: number;
  /** Which organ the camera is on, or null for the whole body. */
  focus: FocusOrgan | null;
  onToggleFocus: (organ: FocusOrgan | null) => void;
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

/** A polyline scaled to fit the trace box, y down. */
function tracePath(values: number[]): string {
  if (values.length < 2) return "";
  const peak = Math.max(...values, 1e-9);
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
  /** Traces per medicine — one line each. */
  traces: number[][];
  /** The current value at the dial's hour, and the fill 0-1. */
  now: (index: number) => { value: string; fill: number };
};

export default function OrganMonitor({ runs, hours, focus, onToggleFocus }: OrganMonitorProps) {
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
    const max = (fn: (r: SimResult) => number[]) =>
      Math.max(...runs.map((r) => Math.max(...fn(r.result), 0)));
    return {
      concMgPerL: max((r) => r.concMgPerL),
      eliminationMgPerH: max((r) => r.eliminationMgPerH),
      gutMg: max((r) => r.gutMg),
    };
  }, [runs]);

  const tEndH = traces && traces.length > 0 ? traces[0].tH[traces[0].tH.length - 1] : 0;
  const position = tEndH > 0 ? Math.min(1, Math.max(0, hours / tEndH)) : 0;
  const index = traces && traces.length > 0 ? nearestIndex(traces[0].tH, hours) : 0;

  const metrics: OrganMetric[] | null = useMemo(() => {
    if (!traces || !peaks || !runs) return null;
    const per = (pick: (trace: Trace) => number[]) =>
      traces.map((tr) => decimate(pick(tr), MAX_TRACE_SAMPLES));

    const blood = per((tr) => tr.conc);
    const gut = per((tr) => tr.gut);
    const elim = per((tr) => tr.elim);
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

    return [
      {
        organ: "brain" as FocusOrgan,
        label: "Brain",
        basis: "blood reaching the brain — the model has no brain compartment and no barrier",
        traces: blood,
        now: () => ({
          value: `${bloodValue(index).toFixed(2)} mg/L`,
          fill: bloodFill(index),
        }),
      },
      {
        organ: "heart" as FocusOrgan,
        label: "Heart",
        basis: "blood in circulation — one blood pool, the heart is the frame",
        traces: blood,
        now: () => ({
          value: `${bloodValue(index).toFixed(2)} mg/L`,
          fill: bloodFill(index),
        }),
      },
      {
        organ: "lungs" as FocusOrgan,
        label: "Lungs",
        basis: "blood reaching the lungs — the same one shared pool",
        traces: blood,
        now: () => ({
          value: `${bloodValue(index).toFixed(2)} mg/L`,
          fill: bloodFill(index),
        }),
      },
      {
        organ: "liver" as FocusOrgan,
        label: "Liver",
        basis: "clearance at the liver — this is the total body clearance, not a liver-only figure",
        traces: elim,
        now: () => ({
          value: `${elimValue(index).toFixed(2)} mg/h`,
          fill: elimFill(index),
        }),
      },
      {
        organ: "kidneys" as FocusOrgan,
        label: "Kidneys",
        basis: "clearance at the kidneys — the same one clearance term, seen from the other end",
        traces: elim,
        now: () => ({
          value: `${elimValue(index).toFixed(2)} mg/h`,
          fill: elimFill(index),
        }),
      },
      {
        organ: "gut" as FocusOrgan,
        label: "Gut",
        basis: "left in the gut — the depot drains as it absorbs; not part of the modelled compartments",
        traces: gut,
        now: () => ({
          value: `${gutValue(index).toFixed(1)} mg`,
          fill: gutFill(index),
        }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces, peaks, hours, runs]);

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
        const at = metric.now(index);
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
              <span className="mt-1 block font-mono text-[9px] leading-3 tracking-[0.08em] text-ink-3">
                {metric.organ === "gut" ? "DRAINING" : "SATURATION"}
              </span>
            </span>

            <span className="min-w-0">
              <span className="relative block h-[6px] overflow-hidden rounded-full bg-line-strong/60">
                <span
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-brand/40 to-brand transition-transform duration-150 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${Math.max(0.02, at.fill).toFixed(3)})` }}
                />
              </span>
              <svg viewBox={`0 0 ${TRACE_W} ${TRACE_H}`} className="mt-1.5 h-[36px] w-full" aria-hidden="true">
                <line
                  x1={0}
                  x2={TRACE_W}
                  y1={TRACE_H - 1}
                  y2={TRACE_H - 1}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                {metric.traces.map((trace, i) => (
                  <path
                    key={i}
                    d={tracePath(trace)}
                    fill="none"
                    stroke={i === 0 ? "rgba(34, 211, 238, 0.9)" : "rgba(34, 211, 238, 0.45)"}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                ))}
                <line
                  x1={position * TRACE_W}
                  x2={position * TRACE_W}
                  y1={2}
                  y2={TRACE_H - 2}
                  stroke="var(--accent-fill)"
                  strokeWidth={1}
                  opacity={0.7}
                />
              </svg>
            </span>

            <span className="text-right">
              <span className="block font-mono text-[13px] leading-4 tabular-nums text-ink">
                {at.value}
              </span>
            </span>
          </button>
        );
      })}

      <div className="rounded-[8px] border border-line bg-page/40 px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
          {focus ? "What this number is" : "Monitor"}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-ink-2">
          {focus
            ? metrics.find((m) => m.organ === focus)?.basis
            : "Levels are normalised against their own peak across the run; the gut's bar falls as it is absorbed. Click an organ to move the camera to it."}
        </p>
      </div>
    </div>
  );
}

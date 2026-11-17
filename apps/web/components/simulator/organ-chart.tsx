"use client";

/**
 * One organ's graph: real units, shared scale, one line per medicine.
 *
 * The point of this file is that the picture and the number cannot disagree.
 * Before, every trace was normalised to its own maximum, so a peak of
 * 0.002 mg/L and a peak of 40 mg/L drew the same hill, and an organ's line
 * could be a "stress index" while the figure beside it read in bpm or mL/min.
 *
 * Now:
 * - the y-axis carries the quantity the row actually prints (mg/L, bpm, %,
 *   U/L, mL/min, mg), with labelled ticks;
 * - every medicine in a treatment shares one scale, so the lines are
 *   comparable to each other and to the axis;
 * - the time axis is labelled in hours, and the playhead is the dial's hour;
 * - the focused view adds a hover crosshair and a per-medicine readout.
 *
 * `compact` is the row sparkline: same scale rules, no text. It is a small
 * picture of a real quantity, not decoration.
 */

import { useRef, useState } from "react";

export type ChartSeries = {
  id: string;
  name: string;
  color: string;
  /** One value per sample in `tH`, in the series' own units. */
  values: number[];
};

export type OrganChartProps = {
  series: ChartSeries[];
  /** Sample times in hours (ascending), shared by every series. */
  tH: number[];
  /** The simulated window's end, in hours. */
  tEndH: number;
  /** The dial's hour — where the playhead sits. */
  hours: number;
  /** Axis unit, e.g. "mg/L". */
  unit: string;
  /** Decimal places for axis labels and the hover readout. */
  precision?: number;
  /** A dashed reference line (the organ's resting value), when it has one. */
  baseline?: number | null;
  /** Include zero in the domain — true for amounts that start at zero. */
  zeroBased?: boolean;
  /** Draw the row sparkline instead of the detailed chart. */
  compact?: boolean;
  ariaLabel: string;
};

const COMPACT_W = 200;
const COMPACT_H = 40;
const DETAIL_W = 360;
const DETAIL_H = 132;
const DETAIL_PAD = { top: 10, right: 6, bottom: 16, left: 40 };

/** Round a raw step up to 1, 2 or 5 × a power of ten. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / magnitude;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * magnitude;
}

function ticks(min: number, max: number, count: number): number[] {
  const step = niceStep((max - min) / count);
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-6; v += step) {
    // Guard against float drift producing 0.30000000000000004.
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

export function formatValue(v: number, precision: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(precision);
}

/** The y-domain over every line, the baseline and the playhead's values. */
function domainFor(
  series: ChartSeries[],
  baseline: number | null | undefined,
  zeroBased: boolean
): [number, number] {
  const values = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  if (baseline != null && Number.isFinite(baseline)) {
    min = Math.min(min, baseline);
    max = Math.max(max, baseline);
  }
  if (zeroBased) min = 0;
  if (max - min < 1e-9) {
    const pad = Math.max(Math.abs(max) * 0.1, 0.5);
    return [zeroBased ? 0 : min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  return [zeroBased ? 0 : min - pad, max + pad];
}

export default function OrganChart({
  series,
  tH,
  tEndH,
  hours,
  unit,
  precision = 2,
  baseline = null,
  zeroBased = false,
  compact = false,
  ariaLabel,
}: OrganChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = compact ? COMPACT_W : DETAIL_W;
  const h = compact ? COMPACT_H : DETAIL_H;
  const pad = compact
    ? { top: 3, right: 3, bottom: 3, left: 3 }
    : DETAIL_PAD;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  if (series.length === 0 || tH.length < 2) {
    return <div className={compact ? "h-[36px]" : "h-[132px]"} aria-hidden="true" />;
  }

  const [min, max] = domainFor(series, baseline, zeroBased);
  const x = (t: number) => pad.left + (Math.min(Math.max(t, 0), tEndH) / Math.max(tEndH, 1e-9)) * plotW;
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * plotH;

  const clampT = Math.min(Math.max(hours, 0), tEndH);
  const playX = x(clampT);

  /** Linear path through the samples. */
  const line = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(tH[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  /** Area under the first line, back along the axis. */
  const area = (values: number[]) => {
    const top = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(tH[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    return `${top} L${x(tH[tH.length - 1]).toFixed(1)} ${y(min).toFixed(1)} L${x(tH[0]).toFixed(1)} ${y(min).toFixed(1)} Z`;
  };

  const yTicks = compact ? [] : ticks(min, max, 3);
  const xTicks = compact ? [] : [0, 0.25, 0.5, 0.75, 1].map((f) => f * tEndH);

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Map the pointer back into viewBox units, then to the nearest sample.
    const vbX = ((event.clientX - rect.left) / rect.width) * w;
    const f = (vbX - pad.left) / plotW;
    const t = Math.min(Math.max(f, 0), 1) * tEndH;
    let best = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < tH.length; i += 1) {
      const delta = Math.abs(tH[i] - t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = i;
      }
    }
    setHover(best);
  };

  const hoverIndex = hover != null && hover < tH.length ? hover : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className={compact ? "block h-[36px] w-full" : "block h-auto w-full"}
        preserveAspectRatio={compact ? "none" : "xMidYMid meet"}
        role={compact ? undefined : "img"}
        aria-hidden={compact ? true : undefined}
        aria-label={compact ? undefined : ariaLabel}
        onMouseMove={compact ? undefined : onMove}
        onMouseLeave={compact ? undefined : () => setHover(null)}
      >
        {/* Frame and grid — only where there is room to read it. */}
        {!compact ? (
          <>
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line
                  x1={pad.left}
                  x2={w - pad.right}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--line)"
                  strokeWidth={1}
                  opacity={0.55}
                />
                <text
                  x={pad.left - 4}
                  y={y(v) + 2.5}
                  textAnchor="end"
                  className="font-mono tabular-nums"
                  fontSize={7}
                  fill="var(--ink-3)"
                >
                  {formatValue(v, v >= 100 ? 0 : precision)}
                </text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text
                key={`x${i}`}
                x={x(t)}
                y={h - 4}
                textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
                className="font-mono tabular-nums"
                fontSize={7}
                fill="var(--ink-3)"
              >
                {t.toFixed(t >= 10 ? 0 : 1)}h
              </text>
            ))}
            <text
              x={pad.left - 4}
              y={pad.top - 2}
              textAnchor="end"
              className="font-mono uppercase"
              fontSize={6.5}
              fill="var(--ink-3)"
            >
              {unit}
            </text>
          </>
        ) : (
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={h - pad.bottom}
            y2={h - pad.bottom}
            stroke="var(--line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* The organ's resting value, when it has one. */}
        {baseline != null && Number.isFinite(baseline) ? (
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--line-strong)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.8}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Area under the first medicine only: with two or more it would obscure. */}
        {series.length === 1 ? (
          <path d={area(series[0].values)} fill={series[0].color} opacity={0.1} />
        ) : null}

        {series.map((s) => (
          <path
            key={s.id}
            d={line(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={compact ? 1.3 : 1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect={compact ? "non-scaling-stroke" : undefined}
            opacity={series.length === 1 ? 1 : 0.9}
          />
        ))}

        {/* Playhead: the dial's hour. */}
        <line
          x1={playX}
          x2={playX}
          y1={pad.top}
          y2={h - pad.bottom}
          stroke="var(--accent-fill)"
          strokeWidth={1}
          opacity={0.8}
          vectorEffect={compact ? "non-scaling-stroke" : undefined}
        />
        <circle cx={playX} cy={y(valueAt(series[0].values, tH, clampT))} r={compact ? 2 : 2.6} fill={series[0].color} />

        {/* Hover crosshair (detailed view only). */}
        {hoverIndex != null ? (
          <g>
            <line
              x1={x(tH[hoverIndex])}
              x2={x(tH[hoverIndex])}
              y1={pad.top}
              y2={h - pad.bottom}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.7}
            />
            {series.map((s) => (
              <circle
                key={`h${s.id}`}
                cx={x(tH[hoverIndex])}
                cy={y(s.values[hoverIndex] ?? 0)}
                r={2.4}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={1}
              />
            ))}
          </g>
        ) : null}
      </svg>

      {/* Hover readout: time, then each medicine's value at that instant. */}
      {hoverIndex != null ? (
        <div className="pointer-events-none absolute right-1 top-0 rounded border border-line bg-surface/95 px-1.5 py-1 font-mono text-[9px] leading-3 tabular-nums text-ink-2 shadow-sm">
          <span className="text-ink-3">T+{tH[hoverIndex].toFixed(1)}h</span>
          {series.map((s) => (
            <span key={`t${s.id}`} className="ml-1.5" style={{ color: s.color }}>
              {formatValue(s.values[hoverIndex] ?? 0, precision)}
            </span>
          ))}
          <span className="ml-1 text-ink-3">{unit}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Value of a series at an arbitrary hour, linearly interpolated. */
export function valueAt(values: number[], tH: number[], t: number): number {
  if (values.length === 0) return 0;
  if (t <= tH[0]) return values[0];
  const last = tH.length - 1;
  if (t >= tH[last]) return values[last];
  for (let i = 1; i < tH.length; i += 1) {
    if (tH[i] >= t) {
      const span = tH[i] - tH[i - 1];
      const f = span > 1e-9 ? (t - tH[i - 1]) / span : 0;
      return values[i - 1] + (values[i] - values[i - 1]) * f;
    }
  }
  return values[last];
}

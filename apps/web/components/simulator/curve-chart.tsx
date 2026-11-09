"use client";

import type { SimResult } from "@dib/engine";

/**
 * Lightweight hand-rolled SVG curve: concentration (mg/L) vs time (h).
 * No chart dependency; downsamples the RK4 series for rendering.
 */
export default function CurveChart({ result }: { result: SimResult }) {
  const w = 720;
  const h = 320;
  const pad = { t: 24, r: 24, b: 40, l: 56 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  const { tH, concMgPerL, cmaxMgPerL, tmaxH, timeToClearH } = result;

  // downsample for a sane number of path points
  const maxPts = 500;
  const step = Math.max(1, Math.ceil(tH.length / maxPts));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < tH.length; i += step) pts.push({ x: tH[i], y: concMgPerL[i] });
  if (pts[pts.length - 1]?.x !== tH[tH.length - 1]) {
    pts.push({ x: tH[tH.length - 1], y: concMgPerL[concMgPerL.length - 1] });
  }

  const t0 = 0;
  const t1 = tH[tH.length - 1];
  const c1 = Math.max(concMgPerL.reduce((m, c) => Math.max(m, c), 0), 1e-9) * 1.08;

  const sx = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * iw;
  const sy = (c: number) => pad.t + ih - (c / c1) * ih;

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${path} L${sx(t1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${sx(t0).toFixed(1)},${pad.t + ih} Z`;

  const yTicks = 4;
  const xTicks = 4;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Concentration over time curve with a peak of ${cmaxMgPerL.toFixed(2)} milligrams per litre`}
    >
      {/* area + line */}
      <path d={area} fill="rgba(16,185,129,0.10)" />
      <path d={path} fill="none" stroke="rgb(5,150,105)" strokeWidth="2" />

      {/* Cmax marker */}
      {tmaxH != null && cmaxMgPerL > 0 && (
        <>
          <line x1={sx(tmaxH)} y1={sy(cmaxMgPerL)} x2={sx(tmaxH)} y2={pad.t + ih} stroke="rgb(5,150,105)" strokeDasharray="4 3" opacity="0.5" />
          <circle cx={sx(tmaxH)} cy={sy(cmaxMgPerL)} r="4" fill="rgb(5,150,105)" />
          <text x={sx(tmaxH) + 8} y={sy(cmaxMgPerL) + 4} fontSize="11" fill="rgb(4,120,87)">
            Cmax {cmaxMgPerL.toFixed(2)}
          </text>
        </>
      )}

      {/* clear marker */}
      {timeToClearH != null && (
        <line x1={sx(timeToClearH)} y1={pad.t + ih} x2={sx(timeToClearH)} y2={sy(concMgPerL[Math.round(timeToClearH / (t1 / (tH.length - 1)))] ?? 0)} stroke="rgb(245,158,11)" strokeDasharray="4 3" opacity="0.7" />
      )}

      {/* axes */}
      <line x1={pad.l} y1={pad.t + ih} x2={pad.l + iw} y2={pad.t + ih} stroke="rgb(203,213,225)" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ih} stroke="rgb(203,213,225)" />

      <text x={pad.l + iw / 2} y={h - 6} textAnchor="middle" fontSize="11" fill="rgb(100,116,139)">
        time (hours)
      </text>
      <text x={14} y={pad.t + ih / 2} fontSize="11" fill="rgb(100,116,139)" transform={`rotate(-90 14 ${pad.t + ih / 2})`} textAnchor="middle">
        body concentration (mg/L)
      </text>

      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const c = (c1 / yTicks) * i;
        return (
          <g key={`y${i}`}>
            <line x1={pad.l - 4} y1={sy(c)} x2={pad.l} y2={sy(c)} stroke="rgb(203,213,225)" />
            <text x={pad.l - 8} y={sy(c) + 4} textAnchor="end" fontSize="10" fill="rgb(100,116,139)">
              {c.toFixed(1)}
            </text>
          </g>
        );
      })}

      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const t = ((t1 - t0) / xTicks) * i;
        return (
          <g key={`x${i}`}>
            <line x1={sx(t)} y1={pad.t + ih} x2={sx(t)} y2={pad.t + ih + 4} stroke="rgb(203,213,225)" />
            <text x={sx(t)} y={pad.t + ih + 16} textAnchor="middle" fontSize="10" fill="rgb(100,116,139)">
              {t.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

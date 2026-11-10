"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Deterministic PRNG so the bust looks the same on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A procedurally generated bust: head, nose, brow, lips, ears, neck and
 * shoulders, sampled as a point cloud. No model file, no images, no video —
 * every dot is computed here and projected every frame.
 */
function buildBust(): Float32Array {
  const rand = mulberry32(0xd1b);
  const pts: number[] = [];

  // Head: ellipsoid with jaw taper, chin, nose, brow, eye sockets and lips.
  for (let i = 0; i < 2600; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const nx = r * Math.cos(th);
    const ny = u;
    const nz = r * Math.sin(th);

    let x = nx * 0.5;
    let y = ny * 0.64;
    let z = nz * 0.54;

    const chinT = clamp((0.16 - y) / 0.8, 0, 1);
    x *= 1 - 0.32 * chinT * chinT;
    z *= 1 - 0.08 * chinT;
    if (z < 0) z *= 0.92; // flatter back of the head

    const front = Math.max(0, nz);

    // nose
    const nose = Math.exp(-Math.pow(x / 0.085, 2) - Math.pow((y + 0.02) / 0.16, 2));
    z += front * nose * 0.15;
    // brow ridge
    const brow = Math.exp(-Math.pow((y - 0.16) / 0.07, 2)) * Math.exp(-Math.pow(x / 0.27, 2));
    z += front * brow * 0.03;
    // eye sockets
    const eye = Math.exp(-Math.pow((Math.abs(x) - 0.19) / 0.07, 2) - Math.pow((y - 0.05) / 0.06, 2));
    z -= front * eye * 0.025;
    // lips
    const lip = Math.exp(-Math.pow(x / 0.11, 2) - Math.pow((y + 0.33) / 0.05, 2));
    z += front * lip * 0.035;

    pts.push(x, y + 1.32, z);
  }

  // Ears
  for (const side of [-1, 1]) {
    for (let i = 0; i < 90; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pts.push(
        side * (0.475 + r * Math.cos(th) * 0.045),
        1.3 + u * 0.12,
        0.02 + r * Math.sin(th) * 0.065
      );
    }
  }

  // Neck
  for (let i = 0; i < 460; i++) {
    const th = rand() * Math.PI * 2;
    const y = 0.6 + rand() * 0.38;
    const radius = 0.165 + (y - 0.6) * 0.09;
    pts.push(Math.cos(th) * radius, y, Math.sin(th) * radius * 0.9);
  }

  // Shoulders / upper torso
  for (let i = 0; i < 1100; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const nx = r * Math.cos(th);
    const ny = u;
    const nz = r * Math.sin(th);
    if (ny < -0.34) continue; // only the top of the shoulders
    pts.push(nx * 1.02, ny * 0.42 + 0.27, nz * 0.43 - 0.01);
  }

  return new Float32Array(pts);
}

interface ViewerState {
  yaw: number;
  pitch: number;
  vel: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  moved: number;
}

export default function HeadViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = useRef<ViewerState>({
    yaw: 0.55,
    pitch: 0.03,
    vel: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    moved: 0,
  });
  const [turning, setTurning] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points = buildBust();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const projected: { x: number; y: number; z: number; a: number; s: number }[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();

    const draw = () => {
      const s = state.current;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * 0.5;
      const unit = Math.min(width * 0.92, height * 0.96) / 2.35;

      // Soft halo + grounding shadow (drawn, not an image).
      const halo = ctx.createRadialGradient(cx, cy - unit * 0.15, unit * 0.1, cx, cy, unit * 1.35);
      halo.addColorStop(0, "rgba(16, 185, 129, 0.10)");
      halo.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      const shadow = ctx.createRadialGradient(cx, cy + unit * 1.06, 0, cx, cy + unit * 1.06, unit * 0.78);
      shadow.addColorStop(0, "rgba(24, 24, 27, 0.12)");
      shadow.addColorStop(1, "rgba(24, 24, 27, 0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + unit * 1.06, unit * 0.72, unit * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      const cosY = Math.cos(s.yaw);
      const sinY = Math.sin(s.yaw);
      const cosX = Math.cos(s.pitch);
      const sinX = Math.sin(s.pitch);

      projected.length = 0;
      for (let i = 0; i < points.length; i += 3) {
        const x0 = points[i];
        const y0 = points[i + 1] - 1.0;
        const z0 = points[i + 2];

        const x1 = x0 * cosY + z0 * sinY;
        const z1 = -x0 * sinY + z0 * cosY;
        const y2 = y0 * cosX - z1 * sinX;
        const z2 = y0 * sinX + z1 * cosX;

        const persp = 3.4 / (3.4 + z2 * 0.85);
        const depth = clamp((z2 + 0.85) / 1.7, 0, 1);

        projected.push({
          x: cx + x1 * persp * unit,
          y: cy - y2 * persp * unit,
          z: z2,
          a: 0.2 + depth * 0.68,
          s: (0.75 + depth * 1.15) * dpr,
        });
      }

      // Far points first so the near ones sit on top.
      projected.sort((p, q) => p.z - q.z);

      // Depth fog: distant points fade toward the white page, near points stay
      // near-black. Painted far-to-near so the front surface reads on top.
      const shades = [
        { color: "#c4c4cc", alpha: 0.5 },
        { color: "#8a8a94", alpha: 0.66 },
        { color: "#4b4b54", alpha: 0.82 },
        { color: "#18181b", alpha: 0.94 },
      ];
      for (let b = 0; b < shades.length; b++) {
        ctx.globalAlpha = shades[b].alpha;
        ctx.fillStyle = shades[b].color;
        for (const p of projected) {
          const bucket = Math.min(shades.length - 1, Math.floor(p.a * shades.length));
          if (bucket === b) ctx.fillRect(p.x, p.y, p.s, p.s);
        }
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(50, now - last);
      last = now;
      const s = state.current;

      if (!s.dragging) {
        if (!reduced) s.yaw += 0.00017 * dt; // ~35s per full turn
        if (Math.abs(s.vel) > 1e-6) {
          s.yaw += s.vel * dt;
          s.vel *= Math.pow(0.9, dt / 16.7);
        }
      }
      draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    raf = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const nudge = (direction: 1 | -1) => {
    state.current.yaw += direction * (Math.PI / 12);
    state.current.vel = 0;
  };

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const s = state.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.dragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.moved = 0;
    s.vel = 0;
    setTurning(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const s = state.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.moved += Math.abs(dx) + Math.abs(dy);
    s.yaw += dx * 0.008;
    s.pitch = clamp(s.pitch + dy * 0.004, -0.5, 0.5);
    s.vel = dx * 0.00035;
  }

  function endDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    const s = state.current;
    if (!s.dragging) return;
    s.dragging = false;
    setTurning(false);
    if (s.moved < 5) s.yaw += Math.PI / 12; // a tap steps the rotation
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-zinc-200/80 bg-gradient-to-b from-white via-white to-zinc-50 shadow-[0_35px_90px_-38px_rgba(0,0,0,0.45)] sm:rounded-[2rem]">
        <canvas
          ref={canvasRef}
          className={`h-[54svh] w-full touch-none sm:h-[60svh] md:h-[62svh] ${
            turning ? "cursor-grabbing" : "cursor-grab"
          }`}
          aria-label="A slowly rotating point-cloud bust. Drag left or right to turn it, or use the arrow buttons."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>

      <div className="mt-5 flex flex-col items-center gap-2 sm:mt-6">
        <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Turn left"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <span className="px-2 text-xs font-medium text-zinc-500">Drag to turn</span>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Turn right"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <p className="text-[11px] font-light text-zinc-400">
          tap the bust to step · drag left or right to spin
        </p>
      </div>
    </div>
  );
}

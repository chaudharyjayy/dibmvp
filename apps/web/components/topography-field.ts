/** Topography field — a flowing line-field surface rendered with Three.js.
 *
 *  Framework-free so the same visual can drive a standalone canvas
 *  (`components/topography.tsx`) or be instanced many times inside another
 *  scene (`components/blood-flow.tsx`, for red blood cells).
 *
 *  Shapes:
 *  - "landscape": contour-like lines running away from the camera, displaced by
 *    a travelling wave. Reads as flowing fluid.
 *  - "erythrocyte": concentric contour rings on a biconcave disc, i.e. a red
 *    blood cell drawn in the same line language as the hologram.
 */

import * as THREE from "three";

export type TopographyDirection = "forward" | "backward";
export type TopographyShape = "landscape" | "erythrocyte";
export type TopographyHoverEffect = "lift" | "none";
export type TopographyClickEffect = "pulse" | "none";

export interface TopographyOptions {
  /** Line colour. */
  color?: string;
  /** Number of contour lines / rings. */
  lineCount?: number;
  /** Requested line width. WebGL clamps line widths at 1px, so wider values are
   *  drawn as an additive halo pass instead of a thicker line. */
  lineWidth?: number;
  /** Wave amplitude (landscape) or membrane ripple (erythrocyte). */
  elevation?: number;
  /** 0..1 — how strongly the near lines dominate the field. */
  foreground?: number;
  /** Degrees of tilt around the horizontal axis. */
  tilt?: number;
  /** Animation speed multiplier. */
  speed?: number;
  direction?: TopographyDirection;
  /** 0..1 — additive halo strength. */
  glow?: number;
  /** 0..1 — how quickly distant lines fade out. */
  depthOfField?: number;
  /** 0..1 — exponential fog density hint for the containing scene. */
  fog?: number;
  hoverEffect?: TopographyHoverEffect;
  clickEffect?: TopographyClickEffect;
  shape?: TopographyShape;
  /** World-space width/diameter of the field. */
  size?: number;
  /** Overall line opacity. */
  opacity?: number;
}

export interface TopographyField {
  /** Add this to your scene. */
  group: THREE.Group;
  /** Advance the animation. `time` is seconds. */
  update: (time: number) => void;
  /** Raise and brighten the field (pointer hover). */
  setHover: (active: boolean) => void;
  /** Scale/brightness kick (pointer click). */
  pulse: () => void;
  /** Per-material opacity multiplier, used for distance fade. */
  setOpacity: (value: number) => void;
  /** Release geometries and materials. */
  dispose: () => void;
}

interface ResolvedOptions extends Required<Omit<TopographyOptions, "shape" | "hoverEffect" | "clickEffect">> {
  shape: TopographyShape;
  hoverEffect: TopographyHoverEffect;
  clickEffect: TopographyClickEffect;
}

const DEFAULTS = {
  color: "#ff3b30",
  lineCount: 18,
  lineWidth: 1,
  elevation: 1,
  foreground: 0.25,
  tilt: 28,
  speed: 0.3,
  direction: "forward" as TopographyDirection,
  glow: 0.5,
  depthOfField: 0.4,
  fog: 0.3,
  shape: "landscape" as TopographyShape,
  hoverEffect: "lift" as TopographyHoverEffect,
  clickEffect: "pulse" as TopographyClickEffect,
  size: 2,
  opacity: 1,
};

interface BuiltField {
  geometry: THREE.BufferGeometry;
  update: (time: number) => void;
}

/** Flowing terrain lines that run away from the viewer. */
function buildLandscapeField(o: ResolvedOptions): BuiltField {
  const size = o.size;
  const samples = 48;
  const segments = o.lineCount * samples;
  const positions = new Float32Array(segments * 6);
  const colors = new Float32Array(segments * 6);
  const xs = new Float32Array(segments * 2);
  const zs = new Float32Array(segments * 2);

  let cursor = 0;
  for (let i = 0; i < o.lineCount; i += 1) {
    const x = o.lineCount === 1 ? 0 : (-0.5 + i / (o.lineCount - 1)) * size;
    // Lines nearer the middle of the field are the "foreground".
    const near = 1 - Math.abs(x) / (size * 0.5);
    const shade = 1 - o.foreground * (1 - Math.max(0.12, near));

    for (let j = 0; j < samples; j += 1) {
      const z0 = (-0.5 + j / samples) * size;
      const z1 = (-0.5 + (j + 1) / samples) * size;
      xs[cursor * 2] = x;
      xs[cursor * 2 + 1] = x;
      zs[cursor * 2] = z0;
      zs[cursor * 2 + 1] = z1;
      colors[cursor * 6] = shade;
      colors[cursor * 6 + 1] = shade;
      colors[cursor * 6 + 2] = shade;
      colors[cursor * 6 + 3] = shade;
      colors[cursor * 6 + 4] = shade;
      colors[cursor * 6 + 5] = shade;
      cursor += 1;
    }
  }

  const sign = o.direction === "forward" ? 1 : -1;
  const amplitude = o.elevation * 0.28 * size;

  const height = (x: number, z: number, t: number) => {
    const phase = t * o.speed * 2.2 * sign;
    return (
      amplitude *
      (Math.sin(z * 2.4 + x * 1.1 - phase) * 0.6 +
        Math.sin(z * 1.1 - phase * 0.6 + x * 2.2) * 0.3)
    );
  };

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const update = (time: number) => {
    for (let s = 0; s < segments; s += 1) {
      const x0 = xs[s * 2];
      const z0 = zs[s * 2];
      const x1 = xs[s * 2 + 1];
      const z1 = zs[s * 2 + 1];
      positions[s * 6] = x0;
      positions[s * 6 + 1] = height(x0, z0, time);
      positions[s * 6 + 2] = z0;
      positions[s * 6 + 3] = x1;
      positions[s * 6 + 4] = height(x1, z1, time);
      positions[s * 6 + 5] = z1;
    }
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  };

  update(0);
  geometry.computeBoundingSphere();
  return { geometry, update };
}

/** Concentric contour rings on a biconcave disc — a red blood cell. */
function buildErythrocyteField(o: ResolvedOptions): BuiltField {
  const radius = o.size * 0.5;
  // Biconcave profile: thin dimple in the middle, thicker rim.
  const thickness = radius * 0.34;
  const segments = 64;
  const total = o.lineCount * segments;
  const positions = new Float32Array(total * 6);
  const colors = new Float32Array(total * 6);
  const wobble = o.elevation * radius * 0.02;

  let cursor = 0;
  for (let i = 0; i < o.lineCount; i += 1) {
    const u = (i + 1) / o.lineCount;
    const r = radius * u;
    const edge = Math.sqrt(Math.max(0, 1 - u * u));
    const dimple = 1 - 0.72 * Math.exp(-(u * u) / 0.16);
    const y = thickness * edge * dimple;
    const shade = 1 - o.foreground * u * 0.6;

    for (let j = 0; j < segments; j += 1) {
      const a0 = (j / segments) * Math.PI * 2;
      const a1 = ((j + 1) / segments) * Math.PI * 2;
      positions[cursor * 6] = Math.cos(a0) * r;
      positions[cursor * 6 + 1] = y + Math.sin(a0 * 4) * wobble;
      positions[cursor * 6 + 2] = Math.sin(a0) * r;
      positions[cursor * 6 + 3] = Math.cos(a1) * r;
      positions[cursor * 6 + 4] = y + Math.sin(a1 * 4) * wobble;
      positions[cursor * 6 + 5] = Math.sin(a1) * r;
      for (let k = 0; k < 6; k += 1) colors[cursor * 6 + k] = shade;
      cursor += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  return { geometry, update: () => {} };
}

/** Builds a topography field ready to be added to any scene. */
export function createTopographyField(options: TopographyOptions = {}): TopographyField {
  const o: ResolvedOptions = { ...DEFAULTS, ...options };
  const accent = new THREE.Color(o.color);

  const group = new THREE.Group();
  group.rotation.x = THREE.MathUtils.degToRad(-o.tilt);

  const built =
    o.shape === "erythrocyte" ? buildErythrocyteField(o) : buildLandscapeField(o);

  const baseOpacity = Math.min(1, Math.max(0.02, o.opacity));
  const haloWidth = Math.max(1, o.lineWidth);

  const coreMaterial = new THREE.LineBasicMaterial({
    color: accent,
    vertexColors: true,
    transparent: true,
    opacity: baseOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });

  const haloMaterial = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: baseOpacity * 0.22 * o.glow * haloWidth,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });

  const core = new THREE.LineSegments(built.geometry, coreMaterial);
  const halo = o.glow > 0 ? new THREE.LineSegments(built.geometry, haloMaterial) : null;
  group.add(core);
  if (halo) group.add(halo);

  let hover = 0;
  let hoverTarget = 0;
  let pulseStart = -1;
  let pulseRequested = false;
  let opacityScale = 1;

  return {
    group,
    update(time) {
      built.update(time);
      hover += (hoverTarget - hover) * 0.12;

      if (pulseRequested) {
        pulseRequested = false;
        pulseStart = time;
      }

      let scale = 1;
      if (pulseStart >= 0) {
        const age = time - pulseStart;
        if (age > 0.7) {
          pulseStart = -1;
        } else {
          scale += Math.sin((age / 0.7) * Math.PI) * 0.22;
        }
      }
      scale *= 1 + hover * (o.hoverEffect === "lift" ? 0.07 : 0);
      group.scale.setScalar(scale);

      const boost = 1 + hover * 0.45;
      coreMaterial.opacity = Math.min(1, baseOpacity * opacityScale * boost);
      haloMaterial.opacity = Math.min(
        1,
        baseOpacity * 0.22 * o.glow * haloWidth * opacityScale * boost,
      );
    },
    setHover(active) {
      hoverTarget = active ? 1 : 0;
    },
    pulse() {
      if (o.clickEffect === "pulse") pulseRequested = true;
    },
    setOpacity(value) {
      opacityScale = Math.min(1, Math.max(0, value));
    },
    dispose() {
      built.geometry.dispose();
      coreMaterial.dispose();
      haloMaterial.dispose();
    },
  };
}

/**
 * Brain geometry — a high-fidelity procedural brain built in code.
 *
 * No model file, no image, no video: the cortical surface is generated from
 * domain-warped wave fields folded over an anatomically shaped base, so the
 * gyri and sulci meander the way real cortex does. The named landmarks
 * (central sulcus, Sylvian fissure, pre-occipital notch, longitudinal
 * fissure) are carved alongside the fine folds, because convincing cortex
 * without them still reads as an undifferentiated lump.
 *
 * The module is framework-free and returns plain Three.js geometry plus the
 * per-vertex data the scene needs:
 *   - `color`  : tissue tone, dark in the sulci and light on the gyral crowns
 *   - `baseNormal`: the smooth pre-fold normal, used for a rim that traces the
 *     silhouette instead of lighting up every crease as a bright crack
 *
 * Everything is deterministic: the same call returns the same mesh.
 */

import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/* Surface resolution                                                          */
/* -------------------------------------------------------------------------- */

/** Tessellation presets.
 *
 *  `scene` is sized for the brain inside the head, which is about 5% of the
 *  frame height: enough to hold the fold silhouette and the sulcal shading,
 *  without spending the figure's triangle budget on detail the head can
 *  never show. `hero` is for a close-up render, where the folds are the
 *  subject and every crease counts.
 */
export const BRAIN_DETAIL = {
  scene: { lat: 44, lon: 60, cerebellumLat: 16, cerebellumLon: 24 },
  hero: { lat: 168, lon: 232, cerebellumLat: 56, cerebellumLon: 84 },
} as const;

export type BrainDetail = keyof typeof BRAIN_DETAIL;

type Detail = { lat: number; lon: number; cerebellumLat: number; cerebellumLon: number };

/** Base cerebrum radii in brain-local units. */
const RX = 0.72;
const RY = 0.64;
const RZ = 0.86;

/* -------------------------------------------------------------------------- */
/* Gradient noise                                                               */
/* -------------------------------------------------------------------------- */

function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value noise in [-1, 1]. */
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);

  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);

  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w) * 2 - 1;
}

/** Fractal Brownian motion in roughly [-1, 1]. */
function fbm(x: number, y: number, z: number, octaves: number): number {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, z * frequency);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / norm;
}

interface FoldField {
  /** Broad gyral swell. */
  broad: number;
  /** Narrow sulcal groove weight, 1 at a groove centre. */
  sulcus: number;
  /** Fine surface detail. */
  detail: number;
}

/** Layered fold field sampled in normalised brain space. */
function foldField(x: number, y: number, z: number): FoldField {
  // Domain warp: bends every fold so nothing runs in a straight line.
  const warp = fbm(x * 2.2 + 11.3, y * 2.2 + 4.7, z * 2.2 + 7.9, 3);
  const warp2 = fbm(x * 1.4 - 5.1, y * 1.4 + 9.3, z * 1.4 - 2.7, 2);

  // Warp the sampling position rather than the phase. Bending the phase makes
  // its gradient collapse in places, which leaves wide plateaus beside dense
  // creases; domain warping keeps the ribbon spacing even while the direction
  // meanders.
  const px = x + warp * 0.16 + warp2 * 0.06;
  const py = y + warp * 0.13 - warp2 * 0.05;
  const pz = z - warp * 0.14 + warp2 * 0.05;

  // Sulci are the zero set of a smooth 3D field: where the field crosses
  // zero it draws a curve on the surface, and those curves branch and loop
  // the way the sulcal network does. A single family of parallel ribbons
  // reads as worms instead, so the network is what carries the folding.
  const primary = fbm(px * 2.9, py * 2.9, pz * 2.9, 3);
  const secondary = fbm(px * 5.7 + 4.1, py * 5.7 - 2.3, pz * 5.7 + 6.7, 2);
  const groovePrimary = Math.exp(-Math.pow(primary / 0.105, 2));
  const grooveSecondary = Math.exp(-Math.pow(secondary / 0.09, 2)) * 0.85;
  const sulcus = Math.pow(Math.max(groovePrimary, grooveSecondary), 1.4);

  // Low-frequency regional swell and fine cortical texture.
  const broad = fbm(x * 2.4 + warp * 0.6, y * 2.4, z * 2.4, 3);
  const detail = fbm(x * 9.1 + 3.1 + warp2 * 0.4, y * 9.1, z * 9.1, 2);
  return { broad, sulcus, detail };
}

/** Large landmarks: the grooves that make a brain identifiable at a glance.
 *
 *  These are the named sulci a viewer expects to find. Without them the
 *  surface is convincing cortex but reads as any folded lump.
 */
function landmarkDepth(x: number, y: number, z: number): number {
  let depth = 0;

  // Central sulcus: runs obliquely over the crown between frontal and parietal.
  if (y > -0.06) {
    const d = Math.abs(z - (0.2 - 0.8 * y));
    depth = Math.max(depth, 0.85 * Math.exp(-((d / 0.1) ** 2)));
  }

  // Pre-occipital notch: the small bite that marks the occipital pole.
  if (y < 0.16) {
    const d = Math.abs(z + 0.9);
    depth = Math.max(depth, 0.7 * Math.exp(-((d / 0.075) ** 2)));
  }

  return depth;
}

/* -------------------------------------------------------------------------- */
/* Cerebrum surface                                                             */
/* -------------------------------------------------------------------------- */

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Maps a point on the unit sphere to the cortical surface.
 *
 * Writes the surface position to `out`, a per-vertex shading weight to
 * `shade` (1 = gyral crown, 0 = sulcal floor) and the smooth pre-fold normal
 * to `baseNormal`.
 */
function cerebrumPoint(
  dx: number,
  dy: number,
  dz: number,
  out: THREE.Vector3,
  shade: { value: number },
  baseNormal: THREE.Vector3,
): THREE.Vector3 {
  // Anatomical proportions: an ellipsoid whose radius is modulated so the
  // profile reads as a brain — rounded frontal pole, tapered occipital pole,
  // a temporal mass under the lateral fissure and a sloped base.
  let radius = 1;
  // Frontal pole: fuller and more rounded, reaching further forward.
  radius += 0.075 * smoothstep(0.15, 1, dz);
  // Occipital pole: narrower, tucked down behind the cerebellum.
  radius -= 0.12 * smoothstep(0.1, 1, -dz);

  let x = dx * radius * RX;
  let y = dy * radius * RY;
  let z = dz * radius * RZ;

  // Drop the poles below the crown so the silhouette arcs rather than
  // sitting flat across the top like a loaf.
  y -= 0.1 * RY * smoothstep(0.25, 1, Math.abs(dz));
  y -= 0.06 * RY * smoothstep(0.3, 1, -dz);

  // Temporal lobe: a rounded lateral mass, not a smooth swell.
  const temporalDistance = Math.hypot(
    Math.max(0, Math.abs(dx) - 0.44) * 1.2,
    (dy + 0.3) * 1.05,
    (dz - 0.18) * 0.9,
  );
  const temporal = Math.exp(-Math.pow(temporalDistance / 0.38, 2));
  x += Math.sign(dx) * 0.065 * temporal;
  y -= 0.015 * temporal;

  // Base: compress the underside onto a plane that slopes down towards the
  // occipital pole, the way the orbital surface and temporal poles do.
  const floorY = -0.1 - 0.12 * smoothstep(0.5, -0.9, dz);
  const flatten = smoothstep(floorY + 0.1, floorY - 0.3, y);
  if (flatten > 0) {
    const compressed = floorY + (y - floorY) * 0.5;
    y = y + (compressed - y) * flatten;
  }

  // Ellipsoid normal, used as the displacement direction.
  let nx = x / (RX * RX);
  let ny = y / (RY * RY);
  let nz = z / (RZ * RZ);
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;

  // Lateral (Sylvian) fissure: separates the temporal lobe from the rest of
  // the hemisphere. Without it the silhouette reads as a smooth blob.
  // The lateral mask is smoothstepped so it does not leave a crease of its own.
  const lateral = smoothstep(0.34, 0.72, Math.abs(dx));
  const sylvian = Math.exp(-Math.pow((y + 0.2 * z - 0.04) / 0.075, 2)) * lateral;

  // Folds, sampled in normalised brain space.
  const field = foldField(x / RX, y / RY, z / RZ);
  const fissure = Math.exp(-Math.pow(x / 0.075, 2)) * smoothstep(-0.05, 0.42, y);
  const foldAmplitude = 0.075 * (1 - 0.85 * fissure);
  // Folds plus the named anatomical landmarks, carved by the same term.
  const landmark = landmarkDepth(dx, dy, dz);
  const sulcus = Math.max(field.sulcus, landmark);
  const displacement =
    foldAmplitude * (0.55 * field.broad + 0.3 * field.detail) -
    0.06 * sulcus * (1 - fissure) -
    0.075 * sylvian;

  x += nx * displacement;
  y += ny * displacement;
  z += nz * displacement;

  // Longitudinal fissure: carve a narrow valley down the midline.
  const carve = fissure * 0.065;
  x -= nx * carve;
  y -= ny * carve;
  z -= nz * carve;

  shade.value = Math.min(
    1,
    Math.max(0, 0.74 + 0.4 * (field.broad + 0.35 * field.detail) - 0.5 * sulcus),
  );

  // The smooth underlying normal, before the folds.
  baseNormal.set(nx, ny, nz);

  return out.set(x, y, z);
}

/** Solid cortical surface. */
function buildCerebrumGeometry(detail: Detail): THREE.BufferGeometry {
  const positions: number[] = [];
  const tones: number[] = [];
  const baseNormals: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  const base = new THREE.Vector3();
  const shade = { value: 0.6 };

  for (let i = 0; i <= detail.lat; i += 1) {
    const lat = -Math.PI / 2 + (i / detail.lat) * Math.PI;
    const cosLat = Math.cos(lat);
    for (let j = 0; j <= detail.lon; j += 1) {
      const lon = (j / detail.lon) * Math.PI * 2;
      cerebrumPoint(
        cosLat * Math.cos(lon),
        Math.sin(lat),
        cosLat * Math.sin(lon),
        v,
        shade,
        base,
      );
      positions.push(v.x, v.y, v.z);
      baseNormals.push(base.x, base.y, base.z);
      // 1 on a gyral crown, 0 on a sulcal floor.
      tones.push(shade.value);
    }
  }

  const stride = detail.lon + 1;
  for (let i = 0; i < detail.lat; i += 1) {
    for (let j = 0; j < detail.lon; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aTone", new THREE.Float32BufferAttribute(tones, 1));
  geometry.setAttribute("baseNormal", new THREE.Float32BufferAttribute(baseNormals, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/* -------------------------------------------------------------------------- */
/* Cerebellum and brainstem                                                     */
/* -------------------------------------------------------------------------- */

/** Ridged cerebellar mass with transverse folia and a midline vermis. */
function buildCerebellumGeometry(detail: Detail): THREE.BufferGeometry {
  const positions: number[] = [];
  const tones: number[] = [];
  const baseNormals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= detail.cerebellumLat; i += 1) {
    const lat = -Math.PI / 2 + (i / detail.cerebellumLat) * Math.PI;
    const cosLat = Math.cos(lat);
    for (let j = 0; j <= detail.cerebellumLon; j += 1) {
      const lon = (j / detail.cerebellumLon) * Math.PI * 2;
      const nx = cosLat * Math.cos(lon);
      const ny = Math.sin(lat);
      const nz = cosLat * Math.sin(lon);

      // Folia: tight transverse bands, the signature of the cerebellar cortex.
      // The phase is warped so the ridges meander instead of reading as a
      // machine-turned coil, and the amplitude falls off at the poles.
      const warp = fbm(nx * 2.4, ny * 2.4, nz * 2.4, 2);
      const band = Math.sin(ny * 38 + warp * 2.4 + Math.sin(nz * 2.6) * 0.5);
      const band2 = Math.sin(ny * 17 + nx * 3.1 + warp * 1.4);
      // Vermis: shallow midline groove between the two hemispheres.
      const vermis = Math.exp(-Math.pow(nx / 0.18, 2));
      const polar = 1 - Math.pow(Math.abs(ny), 2.2);
      const folia =
        (0.012 * band * (1 - 0.4 * vermis) + 0.005 * band2) * polar +
        0.005 * fbm(nx * 12, ny * 12, nz * 12, 2);
      const r = 1 + folia - 0.07 * vermis;
      // Wider than tall, and tapering towards the midline.
      const taper = 1 - 0.28 * Math.pow(Math.abs(nx), 3);
      positions.push(nx * r * 0.32 * taper, ny * r * 0.19, nz * r * 0.23);
      baseNormals.push(nx, ny, nz);
      tones.push(0.7 + 0.2 * (0.5 + 0.5 * band) * polar);
    }
  }

  const stride = detail.cerebellumLon + 1;
  for (let i = 0; i < detail.cerebellumLat; i += 1) {
    for (let j = 0; j < detail.cerebellumLon; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aTone", new THREE.Float32BufferAttribute(tones, 1));
  geometry.setAttribute("baseNormal", new THREE.Float32BufferAttribute(baseNormals, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.translate(0, -0.28, -0.4);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Tapered brainstem running from the underside toward the spinal cord. */
function buildBrainstemGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.055, 0.032, 0.17, 24, 5, false);
  geometry.rotateX(-0.42);
  // Tucked under the cerebrum so only a short stub is visible.
  geometry.translate(0, -0.26, -0.16);
  geometry.computeVertexNormals();

  // The stem shares the cortical material, so it needs the same attributes.
  const count = geometry.getAttribute("position").count;
  const tones = new Float32Array(count);
  const baseNormals = new Float32Array(count * 3);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < count; i += 1) {
    tones[i] = 0.87;
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    baseNormals[i * 3] = x / length;
    baseNormals[i * 3 + 1] = y / length;
    baseNormals[i * 3 + 2] = z / length;
  }
  geometry.setAttribute("aTone", new THREE.BufferAttribute(tones, 1));
  geometry.setAttribute("baseNormal", new THREE.BufferAttribute(baseNormals, 3));
  return geometry;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                   */
/* -------------------------------------------------------------------------- */

export interface BrainGeometry {
  /** Cerebral hemispheres: gyri, sulci and the longitudinal fissure. */
  cerebrum: THREE.BufferGeometry;
  /** Cerebellum with folia and vermis. */
  cerebellum: THREE.BufferGeometry;
  /** Tapered brainstem. */
  brainstem: THREE.BufferGeometry;
  /** Every geometry, for disposal. */
  all: THREE.BufferGeometry[];
  /** Half-extents of the whole brain, centred on the origin. */
  halfExtents: THREE.Vector3;
}

/** Builds the brain geometry. Deterministic: same input, same mesh.
 *
 *  The result is centred on the origin so a caller can scale it to fit a
 *  cranium without compensating for the cerebellum and brainstem hanging
 *  below and behind the cerebrum.
 */
export function buildBrainGeometry(detail: BrainDetail = "scene"): BrainGeometry {
  const resolution = BRAIN_DETAIL[detail];
  const cerebrum = buildCerebrumGeometry(resolution);
  const cerebellum = buildCerebellumGeometry(resolution);
  const brainstem = buildBrainstemGeometry();
  const all = [cerebrum, cerebellum, brainstem];

  const bounds = new THREE.Box3();
  for (const part of all) {
    part.computeBoundingBox();
    if (part.boundingBox) bounds.union(part.boundingBox);
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  for (const part of all) part.translate(-centre.x, -centre.y, -centre.z);

  return {
    cerebrum,
    cerebellum,
    brainstem,
    all,
    halfExtents: size.multiplyScalar(0.5),
  };
}

/** Triangle count of a brain geometry set, for the render budget. */
export function countBrainTriangles(geometry: BrainGeometry): number {
  let total = 0;
  for (const part of geometry.all) {
    const index = part.getIndex();
    total += index ? index.count / 3 : part.getAttribute("position").count / 3;
  }
  return total;
}

/**
 * Glass figure — a see-through human generated entirely in code.
 *
 * No model files, no images, no video: a lathe torso, a sphere head, a neck
 * tube and eight ellipsoid organs, lit by one hemisphere and one directional
 * light. The torso is a Fresnel shell so the organs read through it; each
 * organ is tinted toward the accent by its current level.
 *
 * Everything here is framework-free and returns a handle; the React component
 * owns the DOM and forwards pointer/keyboard input. See the spec in the
 * landing rebuild notes for the constants (fov 32°, z 6.4, alpha
 * mix(0.05, 0.5, pow(1 - |n·v|, 2.2)), etc).
 */

import * as THREE from "three";
import { EASE_OUT } from "./easing";
import { curve, DIAL_HOURS, levelsAt, type OrganId, type OrganLevels } from "./dial";

export type { OrganId };

export type FigureLevels = OrganLevels;

export type FigureStats = {
  /** Triangles submitted in the last rendered frame (includes the outline pass). */
  triangles: number;
  /** Draw calls in the last rendered frame. */
  drawCalls: number;
  points: number;
  /** Unique triangles in the figure's geometry, outline pass excluded. */
  geometryTriangles: number;
  /** Current yaw about the vertical axis, in radians. */
  yaw: number;
  /** Current pitch, in radians (clamped to ±15°). */
  pitch: number;
  /** Camera orbit used by the scroll phases, in radians. */
  orbit: number;
  zoom: number;
  /** True when the renderer has dropped to a 30fps cap. */
  throttled: boolean;
  /** CSS size of the canvas backing store, for verification. */
  dpr: number;
  /** EMA of the synchronous CPU time spent inside render(), in ms. */
  renderMs: number;
  /** EMA of the time between animation frames, in ms. */
  frameMs: number;
  /**
   * Mean particle position in the figure's local units, for verification.
   * At t=0 it sits inside the gut (y ≈ 0.115); as the dose is absorbed it
   * climbs the circulation loop.
   */
  particleCentroid: [number, number, number];
};

export type FigureSceneOptions = {
  reducedMotion?: boolean;
  /** Device pixel ratio ceiling: 2 on desktop, 1.5 on mobile. */
  maxDpr?: number;
};

export type FigureScene = {
  setLevels(levels: FigureLevels): void;
  /**
   * Move the dial to `hours` on the 0–12 h axis: tints the organs and releases
   * the particles, both from the shared illustrative curve in `dial.ts`.
   */
  setTime(hours: number): void;
  /** Camera orbit about the subject, in radians. 0 = straight on. */
  setOrbit(radians: number): void;
  /** Camera distance from the subject. Spec hero value is 6.4. */
  setZoom(z: number): void;
  /** Animated yaw nudge (chevrons, arrow keys). */
  turnBy(radians: number, ms: number): void;
  /** Direct drag input, in CSS pixels. */
  dragBy(dx: number, dy: number): void;
  stopAutoRotate(): void;
  setPaused(paused: boolean): void;
  getStats(): FigureStats;
  dispose(): void;
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const FIGURE_HEIGHT = 3.05; // world units; the frame at z=6.4, fov 32° is 3.67 tall
const AUTO_ROTATE = 0.12; // rad/s
const DAMPING = 0.92; // per frame, applied to drag velocity
const PITCH_LIMIT = (15 * Math.PI) / 180;
const TORSO_SEGMENTS = 48;
const TORSO_PROFILE_POINTS = 40;
const HEAD_SEGMENTS: [number, number] = [32, 24];
const ORGAN_SEGMENTS: [number, number] = [24, 16];
const OUTLINE_SCALE = 1.012; // 1.2%
const CAMERA_FOV = 32;
const CAMERA_Z = 6.4;

const COLORS = {
  body: 0xaeb9ca,
  base: 0xd7dee8,
  tint: 0x2563eb,
  edge: 0xb8c2d1,
  shadow: 0x0e1116,
} as const;

/** Raw sRGB components — custom shaders write straight to the framebuffer. */
function srgb(hex: number): THREE.Color {
  return new THREE.Color().setRGB(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
}

/** cubic-bezier(0.22, 1, 0.36, 1) — the single easing used across the page. */
const ease = EASE_OUT;

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Torso silhouette as (radius, height) in metres, hip to neck base. */
const TORSO_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.145, 0.0],
  [0.165, 0.06],
  [0.135, 0.18],
  [0.155, 0.3],
  [0.185, 0.42],
  [0.195, 0.5],
  [0.17, 0.54],
  [0.075, 0.55],
];

type OrganSpec = {
  id: OrganId;
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
};

/** Eight ellipsoid organs, hip-to-shoulder. Two lungs, two kidneys. */
const ORGANS: ReadonlyArray<OrganSpec> = [
  { id: "lungs", position: [-0.075, 0.42, 0.0], scale: [0.055, 0.1, 0.05] },
  { id: "lungs", position: [0.075, 0.42, 0.0], scale: [0.055, 0.1, 0.05] },
  { id: "heart", position: [-0.018, 0.33, 0.035], scale: [0.045, 0.052, 0.042] },
  { id: "stomach", position: [0.065, 0.245, 0.02], scale: [0.052, 0.036, 0.036] },
  { id: "liver", position: [-0.05, 0.19, 0.02], scale: [0.07, 0.042, 0.052] },
  { id: "gut", position: [0.0, 0.115, 0.012], scale: [0.085, 0.055, 0.05] },
  { id: "kidneys", position: [-0.068, 0.205, -0.05], scale: [0.028, 0.045, 0.026] },
  { id: "kidneys", position: [0.068, 0.205, -0.05], scale: [0.028, 0.045, 0.026] },
];

function buildTorso(): THREE.LatheGeometry {
  const spline = new THREE.SplineCurve(
    TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y))
  ).getPoints(TORSO_PROFILE_POINTS - 2); // 39 points
  const profile = [new THREE.Vector2(0, 0), ...spline]; // capped hip, 40 points
  return new THREE.LatheGeometry(profile, TORSO_SEGMENTS);
}

function buildHead(): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(1, HEAD_SEGMENTS[0], HEAD_SEGMENTS[1]);
  geometry.scale(0.075, 0.095, 0.082);
  geometry.translate(0, 0.745, 0);
  return geometry;
}

function buildNeck(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(0.056, 0.072, 0.1, 16, 1, true);
  geometry.translate(0, 0.6, 0);
  return geometry;
}

/** Soft radial contact shadow, drawn to a canvas so there is no image asset. */
function buildShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(14,17,22,0.18)");
    gradient.addColorStop(0.5, "rgba(14,17,22,0.09)");
    gradient.addColorStop(1, "rgba(14,17,22,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const BODY_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = 1.0 - abs(dot(normalize(vWorldNormal), normalize(vViewDir)));
    float alpha = mix(0.05, 0.5, pow(fresnel, 2.2));
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const ORGAN_VERTEX = /* glsl */ `
  attribute float aLevel;
  varying vec3 vNormalW;
  varying float vLevel;
  void main() {
    vLevel = aLevel;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 world = model * vec4(position, 1.0);
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ORGAN_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTint;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  varying vec3 vNormalW;
  varying float vLevel;
  void main() {
    vec3 n = normalize(vNormalW);
    float level = clamp(vLevel, 0.0, 1.0);
    vec3 base = mix(uBase, uTint, pow(level, 0.8));
    float lambert = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    vec3 lit = base * (0.62 + 0.38 * lambert * uLightIntensity);
    vec3 emissive = uTint * (0.35 * level);
    gl_FragColor = vec4(lit + emissive, 1.0);
  }
`;

const OUTLINE_VERTEX = /* glsl */ `
  void main() {
    vec3 expanded = position * ${OUTLINE_SCALE.toFixed(4)};
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(expanded, 1.0);
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform vec3 uEdge;
  void main() {
    gl_FragColor = vec4(uEdge, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

const PARTICLE_COUNT = 600;
/** World-space diameter of one point sprite (spec: 0.02). */
const PARTICLE_SIZE = 0.02;
/** Samples precomputed around the circulation loop, so a frame costs lookups. */
const PATH_SAMPLES = 256;

const PARTICLE_VERTEX = /* glsl */ `
  uniform float uPointScale;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPointScale / max(0.001, -mv.z);
    vAlpha = uOpacity;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    // Soft circle: fully opaque core, feathered rim, nothing outside.
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float alpha = smoothstep(1.0, 0.35, r) * vAlpha;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/** Deterministic RNG, so every load shows the same particle scatter. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The loop the particles travel once released: gut -> liver -> heart -> lungs
 * -> shoulder -> lungs -> stomach -> kidney -> gut. Closed, in the figure's
 * own local units (the same space the organ positions use).
 */
function buildCirculation(): Float32Array {
  const loop = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, 0.115, 0.012),
      new THREE.Vector3(-0.05, 0.19, 0.02),
      new THREE.Vector3(-0.018, 0.33, 0.035),
      new THREE.Vector3(-0.075, 0.42, 0.0),
      new THREE.Vector3(0.0, 0.5, 0.0),
      new THREE.Vector3(0.075, 0.42, 0.0),
      new THREE.Vector3(0.065, 0.245, 0.02),
      new THREE.Vector3(0.068, 0.205, -0.05),
      new THREE.Vector3(-0.068, 0.205, -0.05),
    ],
    true,
    "catmullrom",
    0.5
  );
  const samples = new Float32Array(PATH_SAMPLES * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < PATH_SAMPLES; i += 1) {
    loop.getPoint(i / PATH_SAMPLES, point);
    samples[i * 3] = point.x;
    samples[i * 3 + 1] = point.y;
    samples[i * 3 + 2] = point.z;
  }
  return samples;
}


/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export function createFigureScene(
  canvas: HTMLCanvasElement,
  options: FigureSceneOptions = {}
): FigureScene {
  const reducedMotion = options.reducedMotion ?? false;
  const maxDpr = options.maxDpr ?? 2;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  // Lights are declared per the spec and feed the organ shader's uniforms.
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd5dbe5, 0.85);
  scene.add(hemisphere);
  const directional = new THREE.DirectionalLight(0xffffff, 1.0);
  directional.position.set(3, 5, 4);
  scene.add(directional);

  const pivot = new THREE.Group(); // yaw + pitch
  scene.add(pivot);

  /* Body ------------------------------------------------------------- */

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: { uColor: { value: srgb(COLORS.body) } },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const torsoGeometry = buildTorso();
  const headGeometry = buildHead();
  const neckGeometry = buildNeck();

  const bodyParts = [torsoGeometry, headGeometry, neckGeometry].map((geometry) => {
    const mesh = new THREE.Mesh(geometry, bodyMaterial);
    mesh.renderOrder = 3; // after the organs it veils
    pivot.add(mesh);
    return mesh;
  });

  /* Organs ----------------------------------------------------------- */

  const organGeometry = new THREE.SphereGeometry(1, ORGAN_SEGMENTS[0], ORGAN_SEGMENTS[1]);
  const levels = new Float32Array(ORGANS.length);
  const levelAttribute = new THREE.InstancedBufferAttribute(levels, 1);
  levelAttribute.setUsage(THREE.DynamicDrawUsage);
  organGeometry.setAttribute("aLevel", levelAttribute);

  const organMaterial = new THREE.ShaderMaterial({
    vertexShader: ORGAN_VERTEX,
    fragmentShader: ORGAN_FRAGMENT,
    uniforms: {
      uBase: { value: srgb(COLORS.base) },
      uTint: { value: srgb(COLORS.tint) },
      uLightDir: { value: directional.position.clone().normalize() },
      uLightIntensity: { value: directional.intensity },
    },
  });

  const organs = new THREE.InstancedMesh(organGeometry, organMaterial, ORGANS.length);
  organs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  organs.renderOrder = 2;

  const outlineMaterial = new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    uniforms: { uEdge: { value: srgb(COLORS.edge) } },
    side: THREE.BackSide,
  });
  const outline = new THREE.InstancedMesh(organGeometry, outlineMaterial, ORGANS.length);
  outline.renderOrder = 1;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  ORGANS.forEach((organ, index) => {
    position.set(...organ.position);
    scale.set(...organ.scale);
    matrix.compose(position, quaternion, scale);
    organs.setMatrixAt(index, matrix);
    outline.setMatrixAt(index, matrix);
  });
  organs.instanceMatrix.needsUpdate = true;
  outline.instanceMatrix.needsUpdate = true;

  pivot.add(outline, organs);

  /* Particles --------------------------------------------------------- */

  const circulation = buildCirculation();
  const random = mulberry32(0x9e3779b9);

  const gutAnchors = new Float32Array(PARTICLE_COUNT * 3);
  const pathU = new Float32Array(PARTICLE_COUNT);
  const pathSpeed = new Float32Array(PARTICLE_COUNT);
  const thresholds = new Float32Array(PARTICLE_COUNT);
  const positions = new Float32Array(PARTICLE_COUNT * 3);

  // Gut ellipsoid, matching the gut organ's position and scale.
  const GUT = { x: 0, y: 0.115, z: 0.012, rx: 0.085, ry: 0.055, rz: 0.05 };
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    // Uniform inside the ellipsoid: cube-root radius, random direction.
    const radius = Math.cbrt(random());
    const theta = random() * Math.PI * 2;
    const cosPhi = random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    const x = GUT.x + radius * sinPhi * Math.cos(theta) * GUT.rx;
    const y = GUT.y + radius * cosPhi * GUT.ry;
    const z = GUT.z + radius * sinPhi * Math.sin(theta) * GUT.rz;
    gutAnchors[i * 3] = x;
    gutAnchors[i * 3 + 1] = y;
    gutAnchors[i * 3 + 2] = z;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    pathU[i] = random();
    pathSpeed[i] = 0.02 + random() * 0.03; // loops per hour
    // Each particle is absorbed at its own hour inside the absorption phase.
    thresholds[i] = random() * 1.6;
  }

  const particleGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  particleGeometry.setAttribute("position", positionAttribute);

  const particleMaterial = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms: {
      uColor: { value: srgb(COLORS.tint) },
      uOpacity: { value: 0.18 },
      uPointScale: { value: PARTICLE_SIZE * 500 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.renderOrder = 4; // over the shell, so the drug is always visible
  particles.frustumCulled = false;
  pivot.add(particles);

  // Working vectors, allocated once.
  const target = new THREE.Vector3();
  const released = new THREE.Vector3();
  const centroid: [number, number, number] = [0, 0, 0];

  /**
   * Move each particle 8% of the way toward its target for the current hour.
   * The target is a blend of its gut anchor and its slot on the circulation
   * loop, driven by that particle's own absorption threshold — so the cloud
   * empties out of the gut through the absorption phase rather than all at
   * once. `snap` is the reduced-motion path: no per-frame travel, just place.
   */
  function updateParticles(hours: number, snap: boolean) {
    const blend = snap ? 1 : 0.08;
    const level = curve(hours);
    particleMaterial.uniforms.uOpacity.value = 0.18 + 0.72 * Math.min(1, level * 2.2);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      let release = (hours - thresholds[i]) / 0.55;
      release = release < 0 ? 0 : release > 1 ? 1 : release;
      release = release * release * (3 - 2 * release); // smoothstep

      const u = (pathU[i] + hours * pathSpeed[i]) % 1;
      const scaled = u * PATH_SAMPLES;
      const i0 = Math.floor(scaled) % PATH_SAMPLES;
      const i1 = (i0 + 1) % PATH_SAMPLES;
      const f = scaled - Math.floor(scaled);
      const a0 = i0 * 3;
      const a1 = i1 * 3;
      released.set(
        circulation[a0] + (circulation[a1] - circulation[a0]) * f,
        circulation[a0 + 1] + (circulation[a1 + 1] - circulation[a0 + 1]) * f,
        circulation[a0 + 2] + (circulation[a1 + 2] - circulation[a0 + 2]) * f
      );

      const anchor = i * 3;
      target.set(
        gutAnchors[anchor] + (released.x - gutAnchors[anchor]) * release,
        gutAnchors[anchor + 1] + (released.y - gutAnchors[anchor + 1]) * release,
        gutAnchors[anchor + 2] + (released.z - gutAnchors[anchor + 2]) * release
      );

      positions[anchor] += (target.x - positions[anchor]) * blend;
      positions[anchor + 1] += (target.y - positions[anchor + 1]) * blend;
      positions[anchor + 2] += (target.z - positions[anchor + 2]) * blend;
    }

    positionAttribute.needsUpdate = true;

    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      sx += positions[i * 3];
      sy += positions[i * 3 + 1];
      sz += positions[i * 3 + 2];
    }
    centroid[0] = +(sx / PARTICLE_COUNT).toFixed(3);
    centroid[1] = +(sy / PARTICLE_COUNT).toFixed(3);
    centroid[2] = +(sz / PARTICLE_COUNT).toFixed(3);
  }


  /* Normalise: centre the figure and scale it to FIGURE_HEIGHT. -------- */

  const bounds = new THREE.Box3();
  bodyParts.forEach((part) => {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) bounds.union(part.geometry.boundingBox);
  });
  const height = bounds.max.y - bounds.min.y || 1;
  const figureScale = FIGURE_HEIGHT / height;
  const centreY = (bounds.max.y + bounds.min.y) / 2;
  pivot.scale.setScalar(figureScale);
  pivot.position.y = -centreY * figureScale;
  const footY = -FIGURE_HEIGHT / 2;

  /* Contact shadow ---------------------------------------------------- */

  const shadowTexture = buildShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = footY - 0.01;
  shadow.renderOrder = 0;
  scene.add(shadow);

  /* State ------------------------------------------------------------- */

  let yaw = 0;
  let pitch = 0;
  let yawVelocity = 0;
  let autoRotate = !reducedMotion;
  let tween: { from: number; to: number; start: number; duration: number } | null = null;
  let orbit = 0;
  let zoom = CAMERA_Z;
  let currentTime = 0;
  let offscreen = false;
  let hidden = document.hidden;
  let disposed = false;
  let raf = 0;

  let lastFrame = performance.now();
  let frameEma = 16.7;
  let renderEma = 0;
  let frameCount = 0;
  let throttled = false;
  let lastRender = 0;

  const geometryTriangles =
    (torsoGeometry.index ? torsoGeometry.index.count : torsoGeometry.attributes.position.count) / 3 +
    (headGeometry.index ? headGeometry.index.count : headGeometry.attributes.position.count) / 3 +
    (neckGeometry.index ? neckGeometry.index.count : neckGeometry.attributes.position.count) / 3 +
    ((organGeometry.index ? organGeometry.index.count : organGeometry.attributes.position.count) / 3) *
      ORGANS.length;

  let stats: FigureStats = {
    triangles: 0,
    drawCalls: 0,
    points: 0,
    geometryTriangles,
    yaw: 0,
    pitch: 0,
    orbit: 0,
    zoom: CAMERA_Z,
    throttled: false,
    dpr: 1,
    renderMs: 0,
    frameMs: 0,
    particleCentroid: [0, 0, 0],
  };

  function applyCamera() {
    camera.position.set(Math.sin(orbit) * zoom, 0, Math.cos(orbit) * zoom);
    camera.lookAt(0, 0, 0);
  }

  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Sprite size in device pixels: a PARTICLE_SIZE-wide world disc projects to
    // size * bufferHeight / (2 tan(fov/2)) at unit distance; the vertex shader
    // divides by view depth.
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    particleMaterial.uniforms.uPointScale.value =
      (PARTICLE_SIZE * buffer.y) / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
  }

  /** Paused while the canvas is off-screen or the tab is hidden. */
  function isPaused() {
    return offscreen || hidden;
  }

  function onVisibility() {
    hidden = document.hidden;
    if (!hidden) lastFrame = performance.now();
  }

  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);

    const frameMs = now - lastFrame;
    lastFrame = now;
    // rAF cadence is the only cost signal available without GPU timers: when
    // the browser starts missing deadlines the delta grows, so this drops the
    // render rate to 30fps and lets the queue drain.
    frameEma = frameEma * 0.9 + Math.min(frameMs, 100) * 0.1;

    if (isPaused()) return;
    if (throttled && now - lastRender < 33) return;

    frameCount += 1;
    if (frameCount % 30 === 0) {
      if (!throttled && frameEma > 24) throttled = true;
      else if (throttled && frameEma < 18) throttled = false;
    }

    const dt = Math.min(frameMs / 1000, 0.05);

    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.duration);
      yaw = tween.from + (tween.to - tween.from) * ease(t);
      if (t >= 1) tween = null;
    } else {
      if (autoRotate) yaw += AUTO_ROTATE * dt;
      if (Math.abs(yawVelocity) > 1e-5) {
        yaw += yawVelocity;
        yawVelocity *= DAMPING;
      } else {
        yawVelocity = 0;
      }
    }

    pivot.rotation.y = yaw;
    pivot.rotation.x = pitch;

    // Particles travel on their own, easing 8% toward each frame's target.
    if (!reducedMotion) updateParticles(currentTime, false);

    renderer.render(scene, camera);
    const renderMs = performance.now() - now;
    renderEma = renderEma === 0 ? renderMs : renderEma * 0.9 + renderMs * 0.1;
    lastRender = now;

    const render = renderer.info.render;
    stats = {
      triangles: render.triangles,
      drawCalls: render.calls,
      points: render.points,
      geometryTriangles,
      yaw,
      pitch,
      orbit,
      zoom,
      throttled,
      dpr: renderer.getPixelRatio(),
      renderMs: +renderEma.toFixed(2),
      frameMs: +frameEma.toFixed(2),
      particleCentroid: [centroid[0], centroid[1], centroid[2]],
    };
  }

  resize();
  applyCamera();
  updateParticles(0, true);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);

  return {
    setLevels(next) {
      ORGANS.forEach((organ, index) => {
        const value = next[organ.id];
        if (value !== undefined) {
          levels[index] = Math.min(1, Math.max(0, value));
        }
      });
      levelAttribute.needsUpdate = true;
    },
    setTime(hours) {
      currentTime = Math.max(0, Math.min(DIAL_HOURS, hours));
      const next = levelsAt(currentTime);
      ORGANS.forEach((organ, index) => {
        levels[index] = next[organ.id];
      });
      levelAttribute.needsUpdate = true;
      // Reduced motion gets a still frame; otherwise the frame loop travels.
      if (reducedMotion) updateParticles(currentTime, true);
    },
    setOrbit(radians) {
      orbit = radians;
      applyCamera();
    },
    setZoom(z) {
      zoom = z;
      applyCamera();
    },
    turnBy(radians, ms) {
      autoRotate = false;
      yawVelocity = 0;
      // Presses during an in-flight tween accumulate from its target, so a
      // double-click turns 30°, without the figure jumping.
      const base = tween ? tween.to : yaw;
      tween = { from: yaw, to: base + radians, start: performance.now(), duration: ms };
    },
    dragBy(dx, dy) {
      autoRotate = false;
      tween = null;
      // The pointer directly sets the yaw, and the last increment is carried
      // as velocity so releasing mid-drag leaves a short, damped glide.
      const step = dx * 0.006;
      yaw += step;
      yawVelocity = THREE.MathUtils.clamp(step * 0.5, -0.02, 0.02);
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.004, -PITCH_LIMIT, PITCH_LIMIT);
    },
    stopAutoRotate() {
      autoRotate = false;
    },
    setPaused(next) {
      offscreen = next;
      if (!next) lastFrame = performance.now();
    },
    getStats() {
      return stats;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      bodyParts.forEach((part) => part.geometry.dispose());
      bodyMaterial.dispose();
      organGeometry.dispose();
      organMaterial.dispose();
      outlineMaterial.dispose();
      organs.dispose();
      outline.dispose();
      shadow.geometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
    },
  };
}

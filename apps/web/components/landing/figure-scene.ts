/**
 * Glass figure — the Blender anatomy model, loaded from a GLB.
 *
 * No procedural lathe, no code-generated organs: the figure is
 * `assets/anatomy/human_anatomy.blend` exported to `models/human_anatomy.glb`
 * (94,626 triangles, ~1.6 MB). The .blend stays the source of truth; regenerate
 * the GLB with `scripts/anatomy/export-web.py`.
 *
 * What the model does not have matters as much as what it does. There is no
 * digestive tract in it, so `stomach` and `gut` from `levelsAt()` have no mesh
 * to tint: the absorption phase is carried by the particles leaving the
 * abdominal point and by the blood level rising through the heart, lungs and
 * vessels. The liver, kidneys, lungs and heart tint from the same
 * illustrative curve.
 *
 * Everything around the model is unchanged: the Fresnel shell for the body, the
 * particle loop, the camera/orbit/zoom contract, reduced motion, the 30fps
 * throttle and the pause-off-screen behaviour. The public handle is identical,
 * so hero.tsx and the probes do not need to change.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EASE_OUT } from "./easing";
import { curve, DIAL_HOURS, levelsAt, type OrganId, type OrganLevels } from "./dial";
import { regionOf, type BrainRegion } from "./brain-regions";
import { BRAIN_PART_NAMES } from "./brain-part-names";

export type { OrganId };

export type FigureLevels = OrganLevels;

export type FigureStats = {
  /** Triangles submitted in the last rendered frame. */
  triangles: number;
  /** Draw calls in the last rendered frame. */
  drawCalls: number;
  points: number;
  /** Unique triangles in the loaded GLB — the real measurement for this page. */
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
  /** Mean particle position in the pivot's local units (metres). */
  particleCentroid: [number, number, number];
};

export type FigureStatus = "loading" | "ready" | "error";

export type FigureSceneOptions = {
  reducedMotion?: boolean;
  /** Device pixel ratio ceiling: 2 on desktop, 1.5 on mobile. */
  maxDpr?: number;
  /** Reports the model's load state so the page can show it. */
  onStatus?: (status: FigureStatus) => void;
  /** Called when the pointer lands on a part of the brain. */
  onBrainRegion?: (region: BrainRegion | null) => void;
};

export type FigureScene = {
  setLevels(levels: FigureLevels): void;
  /** Move the dial to `hours` on the 0–12 h axis. */
  setTime(hours: number): void;
  /** Camera orbit about the subject, in radians. 0 = straight on. */
  setOrbit(radians: number): void;
  /** Camera distance from the subject. Spec hero value is 6.4. */
  setZoom(z: number): void;
  /** 0–1 brightness boost on the circulating particles. */
  setGlow(amount: number): void;
  /** Animated yaw nudge (chevrons, arrow keys). */
  turnBy(radians: number, ms: number): void;
  /** Direct drag input, in CSS pixels. */
  dragBy(dx: number, dy: number): void;
  stopAutoRotate(): void;
  setPaused(paused: boolean): void;
  /** The organ holding the highest level right now, and where it sits on the
   * canvas in CSS pixels. The HUD reticle locks onto this, so the readout it
   * shows is the model's own state rather than decoration.
   */
  getPeakOrgan(): { id: OrganId; level: number } | null;
  getOrganAnchor(id: OrganId): { x: number; y: number } | null;
  /** The brain region under the pointer, in the canvas's own pixels, or null
   *  when the pointer is not over the brain. */
  getBrainRegion(): { region: BrainRegion; x: number; y: number } | null;
  /** Whether the model is still loading, ready, or failed to load. */
  getStatus(): FigureStatus;
  /** Try the model again after a failure. */
  reload(): void;
  getStats(): FigureStats;
  dispose(): void;
};

const FIGURE_HEIGHT = 3.05; // world units; fits the spec's fov-32 frame at z=6.4
const AUTO_ROTATE = 0.12; // rad/s
const DAMPING = 0.92; // per frame, applied to drag velocity
const PITCH_LIMIT = (15 * Math.PI) / 180;
const CAMERA_FOV = 32;
const CAMERA_Z = 6.4;

const COLORS = {
  body: 0x4fb8ff,
  tint: 0x22d3ee,
  // Base colours as they came out of the .blend, as raw sRGB components.
  brain: 0x9e4d4d, // (0.62, 0.30, 0.30)
  airway: 0xdbe0eb, // (0.86, 0.88, 0.92)
  heart: 0x4d0304, // (0.30, 0.012, 0.016)
  kidney: 0x420a08, // (0.26, 0.04, 0.032)
  liver: 0x330805, // (0.20, 0.032, 0.018)
  lung: 0xb23338, // (0.70, 0.20, 0.22)
  artery: 0x8c0505, // (0.55, 0.02, 0.02)
  vein: 0x0a1266, // (0.04, 0.07, 0.40)
} as const;

/** Raw sRGB components — custom shaders write straight to the framebuffer. */
function srgb(hex: number): THREE.Color {
  return new THREE.Color().setRGB(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
}

const ease = EASE_OUT;

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const BODY_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    vWorldY = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uScan;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 v = normalize(vViewDir);
    // The skin is a thin sheet, so what reads is its edge: the light gathers
    // where the surface turns away from the eye. The Fresnel term alone is
    // not enough — on a sheet this thin, the whole surface catches it and
    // the body turns into a solid white shell.
    float facing = abs(dot(n, v));
    // A dead zone in the middle of the term, so the flat of the sheet stays
    // clear and the organs read through it.
    float edge = smoothstep(0.45, 0.96, 1.0 - facing);
    // The scan band is what makes it read as a hologram rather than a ghost:
    // one horizontal band of light travelling down the body.
    float band = exp(-pow((vWorldY - uScan) * 6.5, 2.0));
    float alpha = edge * 0.85 + band * 0.12;
    gl_FragColor = vec4(uColor * (0.85 + band * 1.5), alpha);
  }
`;

/* One lit-with-tint shader for every organ, but with the level as a uniform:
   the GLB organs are plain meshes, not an InstancedMesh. */
const ORGAN_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORGAN_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTint;
  uniform float uLevel;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  varying vec3 vNormalW;
  void main() {
    vec3 n = normalize(vNormalW);
    float level = clamp(uLevel, 0.0, 1.0);
    vec3 base = mix(uBase, uTint, pow(level, 0.8));
    float lambert = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    // Lifted and self-lit: the model's own tissue colours are dark reds and
    // would disappear against a dark panel, so the tissue carries its own
    // glow and the level adds the accent on top.
    vec3 lit = base * (0.55 + 0.45 * lambert * uLightIntensity) * 1.45;
    vec3 emissive = uTint * (0.16 + 0.45 * level);
    gl_FragColor = vec4(lit + emissive, 1.0);
  }
`;

/* Brain: the tissue look, plus a Fresnel rim so the folds read as a solid form
   inside the glass head. The GLB carries no per-vertex tone, so the tone
   term is gone; the rim does the same job. */
const BRAIN_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BRAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTint;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalW);
    float lambert = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    float fill = clamp(dot(n, -normalize(uLightDir)), 0.0, 1.0);
    vec3 lit = uBase * (0.62 + 0.34 * lambert * uLightIntensity + 0.12 * fill) * 1.35;
    float rim = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.4);
    lit += uTint * rim * 0.38;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* GLB layout                                                           */
/* ------------------------------------------------------------------ */

/** Node names as the glTF exporter wrote them. Names are the contract. */
const GLB = {
  body: "Body",
  heart: ["Heart"],
  liver: ["Liver"],
  lungs: ["Lung_L", "Lung_R"],
  kidneys: ["Kidney_L", "Kidney_R"],
  /** The brain is 38 named gyri and 27 deep nuclei, plus the cerebellum and
   *  the brainstem. They are matched by prefix because the exact set is the
   *  anatomy's, not the web's: a click on the model has to be able to say
   *  which gyrus it landed on. */
  brainPrefixes: ["Cortex_", "Deep_"],
  brainExtras: ["Cerebellum", "BrainStem"],
  airway: ["Trachea", "Bronchus_L", "Bronchus_R"],
  /** Every mesh that is neither an organ nor the shell: the great vessels,
   *  the heart's coronaries and the great cardiac veins. They all carry the
   *  blood shape, so they are found by what they are rather than by name. */
  vessels: [
    "Aorta_Ascending",
    "Aorta_Arch",
    "Aorta_Descending",
    "Brachiocephalic",
    "Carotid_R",
    "Carotid_L",
    "Subclavian_R",
    "Subclavian_L",
    "PulmonaryArtery",
    "PulmonaryVein",
    "VenaCava_Sup",
    "VenaCava_Inf",
    "RenalArtery_R",
    "RenalArtery_L",
    "RenalVein_R",
    "RenalVein_L",
    "CommonIliac_Art_R",
    "CommonIliac_Art_L",
    "CommonIliac_Vein_R",
    "CommonIliac_Vein_L",
    "BrachioVein_R",
    "BrachioVein_L",
    "JugularVein_R",
    "JugularVein_L",
    "Coronary_L_stem",
    "Coronary_R_trunk",
    "Coronary_Circumflex",
    "Coronary_PostIV",
    "Coronary_AntIV",
    "Coronary_Marginal",
    "Cardiac_GreatVein",
    "Cardiac_MiddleVein",
  ],
} as const;

/** True for a node that is part of the brain. */
function isBrainMesh(name: string): boolean {
  if (GLB.brainExtras.includes(name as (typeof GLB.brainExtras)[number])) return true;
  return GLB.brainPrefixes.some((prefix) => name.startsWith(prefix));
}

/** Which dial organ each mesh follows. Vessels carry the blood shape. */
const FOLLOW: Record<string, OrganId> = {
  Heart: "heart",
  Liver: "liver",
  Lung_L: "lungs",
  Lung_R: "lungs",
  Kidney_L: "kidneys",
  Kidney_R: "kidneys",
  // The gut itself is absent from the model; the vessels are the only
  // structure that visibly "fills" as the level rises.
  ...Object.fromEntries(GLB.vessels.map((name) => [name, "heart" as OrganId])),
};

/** Base colour per node group, raw sRGB. */
const BASE: Record<string, number> = {
  heart: COLORS.heart,
  liver: COLORS.liver,
  lung: COLORS.lung,
  kidney: COLORS.kidney,
  artery: COLORS.artery,
  vein: COLORS.vein,
  brain: COLORS.brain,
  airway: COLORS.airway,
};

const ARTERY = new Set([
  "Aorta_Ascending",
  "Aorta_Arch",
  "Aorta_Descending",
  "Brachiocephalic",
  "Carotid_L",
  "Carotid_R",
  "Subclavian_L",
  "Subclavian_R",
  "PulmonaryVein",
  "RenalArtery_L",
  "RenalArtery_R",
  "CommonIliac_Art_L",
  "CommonIliac_Art_R",
  "Coronary_L_stem",
  "Coronary_R_trunk",
  "Coronary_Circumflex",
  "Coronary_PostIV",
  "Coronary_AntIV",
  "Coronary_Marginal",
]);
const VEIN = new Set([
  "VenaCava_Inf",
  "VenaCava_Sup",
  "PulmonaryArtery",
  "RenalVein_L",
  "RenalVein_R",
  "CommonIliac_Vein_L",
  "CommonIliac_Vein_R",
  "BrachioVein_L",
  "BrachioVein_R",
  "JugularVein_L",
  "JugularVein_R",
  "Cardiac_GreatVein",
  "Cardiac_MiddleVein",
]);

function baseFor(name: string): number {
  if (name === "Heart") return BASE.heart;
  if (name === "Liver") return BASE.liver;
  if (name === "Kidney_L" || name === "Kidney_R") return BASE.kidney;
  if (name === "Lung_L" || name === "Lung_R") return BASE.lung;
  if (ARTERY.has(name)) return BASE.artery;
  if (VEIN.has(name)) return BASE.vein;
  if (isBrainMesh(name)) return BASE.brain;
  if (GLB.airway.includes(name as (typeof GLB.airway)[number])) return BASE.airway;
  return 0xd7dee8;
}

/* ------------------------------------------------------------------ */
/* Particles                                                            */
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
 * The loop the particles travel once released, in the model's own metres:
 * abdominal source -> liver -> heart -> lungs -> over the shoulders -> back
 * down the torso -> kidneys -> source. The model has no digestive tract, so
 * the loop starts at the abdominal point the gut would occupy.
 */
function buildCirculation(): Float32Array {
  const loop = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, 1.02, 0.03),
      new THREE.Vector3(-0.05, 1.14, 0.02),
      new THREE.Vector3(0.028, 1.285, -0.04),
      new THREE.Vector3(-0.075, 1.31, 0.0),
      new THREE.Vector3(0.0, 1.475, 0.0),
      new THREE.Vector3(0.075, 1.31, 0.0),
      new THREE.Vector3(0.0, 1.12, 0.02),
      new THREE.Vector3(0.056, 1.075, 0.044),
      new THREE.Vector3(-0.056, 1.065, 0.044),
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

/**
 * A soft radial pool of light, drawn to a canvas so there is no image asset.
 * It is white with a falling alpha; the material tints it and blends it
 * additively, which is what turns it into a glow under the figure.
 */
function buildShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.22)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

  const hemisphere = new THREE.HemisphereLight(0xbcd8ff, 0x0a1420, 0.7);
  scene.add(hemisphere);
  const directional = new THREE.DirectionalLight(0xd8ecff, 1.1);
  directional.position.set(3, 5, 4);
  scene.add(directional);

  const pivot = new THREE.Group(); // yaw + pitch
  scene.add(pivot);

  /* The loaded model ------------------------------------------------ */

  const disposables: Array<{ dispose(): void }> = [];
  /** Meshes that tint with the dial, by the dial's organ id. */
  const tinted: Array<{ mesh: THREE.Mesh; id: OrganId; material: THREE.ShaderMaterial }> = [];
  /** World-space centre of each organ mesh, for the HUD reticle. */
  const anchors = new Map<OrganId, THREE.Vector3>();
  let geometryTriangles = 0;
  let modelReady = false;

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: {
      uColor: { value: srgb(COLORS.body) },
      // The height of the scan band in world units; the frame loop sweeps it.
      uScan: { value: 0.8 },
    },
    transparent: true,
    depthWrite: false,
    // Additive: on a dark panel the shell has to *add* light. With ordinary
    // blending a translucent shell just dims what is behind it, which reads
    // as a dark mannequin rather than a hologram.
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  disposables.push(bodyMaterial);

  const makeOrganMaterial = (name: string): THREE.ShaderMaterial => {
    const material = new THREE.ShaderMaterial({
      vertexShader: ORGAN_VERTEX,
      fragmentShader: ORGAN_FRAGMENT,
      uniforms: {
        uBase: { value: srgb(baseFor(name)) },
        uTint: { value: srgb(COLORS.tint) },
        uLevel: { value: 0 },
        uLightDir: { value: directional.position.clone().normalize() },
        uLightIntensity: { value: directional.intensity },
      },
    });
    disposables.push(material);
    return material;
  };

  const makeBrainMaterial = (): THREE.ShaderMaterial => {
    const material = new THREE.ShaderMaterial({
      vertexShader: BRAIN_VERTEX,
      fragmentShader: BRAIN_FRAGMENT,
      uniforms: {
        uBase: { value: srgb(COLORS.brain) },
        uTint: { value: srgb(COLORS.tint) },
        uLightDir: { value: directional.position.clone().normalize() },
        uLightIntensity: { value: directional.intensity },
      },
    });
    disposables.push(material);
    return material;
  };

  const brainMaterial = makeBrainMaterial();

  /** Names follow the .blend; find every node as a Mesh. */
  const meshByName = new Map<string, THREE.Mesh>();
  const collectMeshes = (node: THREE.Object3D) => {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      const name = mesh.name || "";
      if (!meshByName.has(name)) meshByName.set(name, mesh);
    }
    for (const child of node.children) collectMeshes(child);
  };

  /* Brain picking ------------------------------------------------------- */
  /* The brain is 65 named parts, so a hit is answered by name: the mesh
     that was hit says which gyrus, and the parts list says what it is.
     Nothing is guessed from the geometry. */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  /** The meshes a brain hit can land on. */
  let brainTargets: THREE.Mesh[] = [];
  /** Where the pointer is over the brain, in canvas pixels. */
  let brainHit: { region: BrainRegion; point: THREE.Vector3 } | null = null;

  /** Reads the anatomical name out of a mesh name: "Cortex_FMA72653_R". */
  function partName(meshName: string): { id: string; name: string } | null {
    const match = /^(?:Cortex|Deep)_(FMA\d+|BP\d+)_[LRM]$/.exec(meshName);
    if (!match) return null;
    const id = match[1];
    const name = BRAIN_PART_NAMES[id];
    return name ? { id, name } : null;
  }

  function pickBrain(clientX: number, clientY: number): void {
    if (!modelReady || brainTargets.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(brainTargets, false);
    let found: { region: BrainRegion; point: THREE.Vector3 } | null = null;
    for (const hit of hits) {
      const part = partName(hit.object.name);
      if (!part) continue;
      const region = regionOf(part.id, part.name);
      if (!region) continue;
      found = { region, point: hit.point.clone() };
      break;
    }
    brainHit = found;
    options.onBrainRegion?.(found ? found.region : null);
  }

  /** Clears the brain hit, when the pointer leaves the figure. */
  function clearBrain(): void {
    if (!brainHit) return;
    brainHit = null;
    options.onBrainRegion?.(null);
  }

  const finishModel = (group: THREE.Group) => {
    collectMeshes(group);

    // Bodies become Fresnel shells; organs get the lit-tint shader; the brain
    // gets the rim shader; airway and vessels keep a flat lit look.
    const bodyMesh = meshByName.get(GLB.body);
    if (bodyMesh) {
      bodyMesh.material = bodyMaterial;
      bodyMesh.renderOrder = 3;
      bodyMesh.castShadow = false;
      bodyMesh.receiveShadow = false;
    }

    for (const [name, id] of Object.entries(FOLLOW) as Array<[string, OrganId]>) {
      const mesh = meshByName.get(name);
      if (!mesh) {
        console.warn(`figure: node "${name}" missing from the GLB — no tint for it`);
        continue;
      }
      const material = makeOrganMaterial(name);
      mesh.material = material;
      mesh.renderOrder = 2;
      tinted.push({ mesh, id, material });
    }

    for (const [name, mesh] of meshByName) {
      if (isBrainMesh(name)) {
        mesh.material = brainMaterial;
        mesh.renderOrder = 2;
      }
    }

    // The pickable brain: the named gyri and nuclei. The cerebellum and the
    // brainstem are in the brain visually but are not lobes, so they are not
    // pick targets.
    brainTargets = [];
    for (const [name, mesh] of meshByName) {
      if (name.startsWith("Cortex_") || name.startsWith("Deep_")) brainTargets.push(mesh);
    }

    for (const name of GLB.airway) {
      const mesh = meshByName.get(name);
      if (mesh) {
        // The airway is not drug-bearing here: lit shell, always level 0.
        const material = makeOrganMaterial(name);
        material.uniforms.uLevel.value = 0;
        mesh.material = material;
        mesh.renderOrder = 2;
      }
    }

    // Normalise: centre the model and scale it to FIGURE_HEIGHT.
    const bounds = new THREE.Box3();
    group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) {
          const geometryBounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
          bounds.union(geometryBounds);
        }
      }
    });
    const height = bounds.max.y - bounds.min.y || 1;
    const scale = FIGURE_HEIGHT / height;
    const centreY = (bounds.max.y + bounds.min.y) / 2;
    pivot.scale.setScalar(scale);
    pivot.position.y = -centreY * scale;

    group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.computeBoundingBox();
        geometryTriangles += mesh.geometry.index
          ? mesh.geometry.index.count / 3
          : mesh.geometry.attributes.position.count / 3;
      }
    });

    pivot.add(group);
    modelReady = true;

    // Where each organ sits, in world space, so the reticle can point at it.
    // The centre of the mesh's own bounding box is close enough for a marker.
    for (const { mesh, id } of tinted) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      if (!box) continue;
      const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      if (!anchors.has(id)) anchors.set(id, centre);
    }

    applyLevels();
  };

  const loader = new GLTFLoader();
  let status: FigureStatus = "loading";
  /** Hidden while the model is missing: they would be meaningless alone. */
  let particleCloud: THREE.Points | null = null;
  let glowPool: THREE.Mesh | null = null;

  const setStatus = (next: FigureStatus) => {
    status = next;
    options.onStatus?.(next);
  };

  const loadModel = () => {
    setStatus("loading");
    loader.load(
      "/models/human_anatomy.glb",
      (gltf) => {
        finishModel(gltf.scene);
        setStatus("ready");
      },
      undefined,
      (error) => {
        // The figure stays out; the dial still works. The error is the loudest
        // signal we can give without pretending a model loaded.
        console.error("figure: failed to load human_anatomy.glb", error);
        if (particleCloud) particleCloud.visible = false;
        if (glowPool) glowPool.visible = false;
        setStatus("error");
      }
    );
  };

  loadModel();

  /* Particles --------------------------------------------------------- */

  const circulation = buildCirculation();
  const random = mulberry32(0x9e3779b9);

  // Abdominal source, where a gut would sit (the model has no digestive tract).
  const SOURCE = { x: 0, y: 1.02, z: 0.03, rx: 0.085, ry: 0.055, rz: 0.05 };
  const gutAnchors = new Float32Array(PARTICLE_COUNT * 3);
  const pathU = new Float32Array(PARTICLE_COUNT);
  const pathSpeed = new Float32Array(PARTICLE_COUNT);
  const thresholds = new Float32Array(PARTICLE_COUNT);
  const positions = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const radius = Math.cbrt(random());
    const theta = random() * Math.PI * 2;
    const cosPhi = random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    const x = SOURCE.x + radius * sinPhi * Math.cos(theta) * SOURCE.rx;
    const y = SOURCE.y + radius * cosPhi * SOURCE.ry;
    const z = SOURCE.z + radius * sinPhi * Math.sin(theta) * SOURCE.rz;
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
  disposables.push(particleGeometry);

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
  disposables.push(particleMaterial);

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.renderOrder = 4; // over the shell, so the drug is always visible
  particles.frustumCulled = false;
  pivot.add(particles);
  particleCloud = particles;

  const target = new THREE.Vector3();
  const released = new THREE.Vector3();
  const centroid: [number, number, number] = [0, 0, 0];

  function updateParticles(hours: number, snap: boolean) {
    const blend = snap ? 1 : 0.08;
    const level = curve(hours);
    const base = 0.18 + 0.72 * Math.min(1, level * 2.2);
    particleMaterial.uniforms.uOpacity.value = Math.min(1, base + 0.25 * glow);

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

  /* Normalisation is applied on load; the shadow sits under the figure. --- */

  // A shadow cannot be seen on a dark panel. The figure instead stands over a
  // soft cyan pool of light, which reads as a hologram on a scanner bed.
  const shadowTexture = buildShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color().setRGB(0.09, 0.55, 0.72),
  });
  disposables.push(shadowTexture, shadowMaterial);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), shadowMaterial);
  disposables.push(shadow.geometry);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -FIGURE_HEIGHT / 2 - 0.01;
  shadow.renderOrder = 0;
  scene.add(shadow);
  glowPool = shadow;

  /* State ------------------------------------------------------------- */

  let yaw = 0;
  let pitch = 0;
  let yawVelocity = 0;
  let autoRotate = !reducedMotion;
  let tween: { from: number; to: number; start: number; duration: number } | null = null;
  let orbit = 0;
  let zoom = CAMERA_Z;
  let currentTime = 0;
  let glow = 0;
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

  let stats: FigureStats = {
    triangles: 0,
    drawCalls: 0,
    points: 0,
    geometryTriangles: 0,
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

  function applyLevels() {
    if (!modelReady) return;
    const next = levelsAt(currentTime);
    for (const { id, material } of tinted) {
      const value = next[id];
      material.uniforms.uLevel.value = value === undefined ? 0 : Math.min(1, Math.max(0, value));
    }
  }

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

    // The hologram band travels down the body. Under reduced motion it parks
    // instead of sweeping: a moving band is decoration, not information.
    if (!reducedMotion) {
      const phase = (now % 5200) / 5200;
      bodyMaterial.uniforms.uScan.value = 1.65 - phase * 3.3;
    }

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

  /* Pointer picking. The brain is the only part of the figure that answers a
     click, so the listener is on the canvas and the raycast is only run
     against the brain meshes. */
  const onPointerMove = (event: PointerEvent) => {
    pickBrain(event.clientX, event.clientY);
  };
  const onPointerLeave = () => {
    clearBrain();
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  raf = requestAnimationFrame(frame);

  return {
    setLevels(next) {
      if (!modelReady) return;
      for (const { id, material } of tinted) {
        const value = next[id];
        material.uniforms.uLevel.value = value === undefined ? 0 : Math.min(1, Math.max(0, value));
      }
    },
    setTime(hours) {
      currentTime = Math.max(0, Math.min(DIAL_HOURS, hours));
      applyLevels();
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
    setGlow(amount) {
      glow = Math.min(1, Math.max(0, amount));
    },
    turnBy(radians, ms) {
      autoRotate = false;
      yawVelocity = 0;
      const base = tween ? tween.to : yaw;
      tween = { from: yaw, to: base + radians, start: performance.now(), duration: ms };
    },
    dragBy(dx, dy) {
      autoRotate = false;
      tween = null;
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
    getPeakOrgan() {
      if (!modelReady) return null;
      const levels = levelsAt(currentTime);
      let peak: { id: OrganId; level: number } | null = null;
      for (const id of ["liver", "heart", "lungs", "kidneys"] as OrganId[]) {
        const level = levels[id];
        if (level === undefined || level <= 0) continue;
        if (!peak || level > peak.level) peak = { id, level };
      }
      return peak;
    },
    getOrganAnchor(id) {
      const world = anchors.get(id);
      if (!world) return null;
      // The organ sits inside the pivot, which carries the yaw and pitch, and
      // the pivot carries the scale that normalises the figure's height.
      const point = world.clone().applyMatrix4(pivot.matrixWorld).project(camera);
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      return {
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
      };
    },
    getBrainRegion() {
      if (!brainHit) return null;
      // The hit is in world space; the label wants canvas pixels.
      const point = brainHit.point.clone().project(camera);
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      return {
        region: brainHit.region,
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
      };
    },
    getStatus() {
      return status;
    },
    reload() {
      // Only a failed load is worth retrying; a loaded model is not re-fetched.
      if (status === "error") loadModel();
    },
    getStats() {
      return stats;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const material = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      disposables.forEach((entry) => entry.dispose());
      renderer.dispose();
    },
  };
}

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

export type FigureSceneOptions = {
  reducedMotion?: boolean;
  /** Device pixel ratio ceiling: 2 on desktop, 1.5 on mobile. */
  maxDpr?: number;
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
  body: 0xaeb9ca,
  tint: 0x2563eb,
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
    vec3 lit = base * (0.62 + 0.38 * lambert * uLightIntensity);
    vec3 emissive = uTint * (0.35 * level);
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
    vec3 lit = uBase * (0.62 + 0.34 * lambert * uLightIntensity + 0.12 * fill);
    float rim = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.4);
    lit += uTint * rim * 0.3;
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
  brain: ["Brain_L", "Brain_R", "Cerebellum", "BrainStem"],
  airway: ["Trachea", "Bronchus_L", "Bronchus_R"],
  vessels: [
    "Aorta",
    "Carotid_L",
    "Carotid_R",
    "VenaCava_Inf",
    "VenaCava_Sup",
    "PulmonaryTrunk",
    "PulmonaryArtery_L",
    "PulmonaryArtery_R",
    "RenalArtery_L",
    "RenalArtery_R",
    "RenalVein_L",
    "RenalVein_R",
  ],
} as const;

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
  "Aorta",
  "Carotid_L",
  "Carotid_R",
  "RenalArtery_L",
  "RenalArtery_R",
]);
const VEIN = new Set([
  "VenaCava_Inf",
  "VenaCava_Sup",
  "PulmonaryTrunk",
  "PulmonaryArtery_L",
  "PulmonaryArtery_R",
  "RenalVein_L",
  "RenalVein_R",
]);

function baseFor(name: string): number {
  if (name === "Heart") return BASE.heart;
  if (name === "Liver") return BASE.liver;
  if (name === "Kidney_L" || name === "Kidney_R") return BASE.kidney;
  if (name === "Lung_L" || name === "Lung_R") return BASE.lung;
  if (ARTERY.has(name)) return BASE.artery;
  if (VEIN.has(name)) return BASE.vein;
  if (GLB.brain.includes(name as (typeof GLB.brain)[number]) || name === "BrainStem") {
    return BASE.brain;
  }
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

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd5dbe5, 0.85);
  scene.add(hemisphere);
  const directional = new THREE.DirectionalLight(0xffffff, 1.0);
  directional.position.set(3, 5, 4);
  scene.add(directional);

  const pivot = new THREE.Group(); // yaw + pitch
  scene.add(pivot);

  /* The loaded model ------------------------------------------------ */

  const disposables: Array<{ dispose(): void }> = [];
  /** Meshes that tint with the dial, by the dial's organ id. */
  const tinted: Array<{ mesh: THREE.Mesh; id: OrganId; material: THREE.ShaderMaterial }> = [];
  let geometryTriangles = 0;
  let modelReady = false;

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: { uColor: { value: srgb(COLORS.body) } },
    transparent: true,
    depthWrite: false,
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

    for (const name of GLB.brain) {
      const mesh = meshByName.get(name);
      if (mesh) {
        mesh.material = brainMaterial;
        mesh.renderOrder = 2;
      }
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
    applyLevels();
  };

  const loader = new GLTFLoader();
  loader.load(
    "/models/human_anatomy.glb",
    (gltf) => finishModel(gltf.scene),
    undefined,
    (error) => {
      // The figure stays out; the dial still works. The error is the loudest
      // signal we can give without pretending a model loaded.
      console.error("figure: failed to load human_anatomy.glb", error);
    }
  );

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

  const shadowTexture = buildShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  disposables.push(shadowTexture, shadowMaterial);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), shadowMaterial);
  disposables.push(shadow.geometry);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -FIGURE_HEIGHT / 2 - 0.01;
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
    getStats() {
      return stats;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
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

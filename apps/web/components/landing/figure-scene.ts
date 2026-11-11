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

export type OrganId = "lungs" | "heart" | "liver" | "stomach" | "gut" | "kidneys";

export type FigureLevels = Partial<Record<OrganId, number>>;

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
};

export type FigureSceneOptions = {
  reducedMotion?: boolean;
  /** Device pixel ratio ceiling: 2 on desktop, 1.5 on mobile. */
  maxDpr?: number;
};

export type FigureScene = {
  setLevels(levels: FigureLevels): void;
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
const ease = (() => {
  const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1];
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const at = (a: number, b: number, c: number, t: number) => ((a * t + b) * t + c) * t;
  const slope = (a: number, b: number, c: number, t: number) => (3 * a * t + 2 * b) * t + c;
  return (x: number) => {
    let t = Math.min(1, Math.max(0, x));
    for (let i = 0; i < 6; i += 1) {
      const err = at(ax, bx, cx, t) - x;
      const d = slope(ax, bx, cx, t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return at(ay, by, cy, t);
  };
})();

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
    };
  }

  resize();
  applyCamera();
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
      renderer.dispose();
    },
  };
}

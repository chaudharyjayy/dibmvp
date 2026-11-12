/**
 * The simulator's anatomy scene: the model, framed on the organs a condition
 * touches.
 *
 * The landing figure shows the whole body turning. The simulator does the
 * opposite: the body is still, and the camera moves to whichever organ the
 * current step is about, so the folds and the vessels are readable.
 *
 * The organ levels are the engine's own numbers — the concentration in the
 * blood, the amount in the gut, the elimination rate — read at the time the
 * dial is on. Nothing here invents a value.
 */

import * as THREE from "three";
import { loadAnatomyModel, type PartAnchor } from "@/components/anatomy/model";
import { baseFor } from "@/components/anatomy/contract";
import {
  BODY_FRAGMENT,
  BODY_VERTEX,
  BRAIN_FRAGMENT,
  BRAIN_VERTEX,
  ORGAN_FRAGMENT,
  ORGAN_VERTEX,
} from "@/components/anatomy/shaders";
import { regionOf, type BrainRegion } from "@/components/anatomy/regions";
import { BRAIN_PART_NAMES } from "@/components/anatomy/part-names";

/** The organs the simulator can focus on. */
export type FocusOrgan = "brain" | "heart" | "lungs" | "liver" | "kidneys" | "gut";

export type SimulatorSceneOptions = {
  reducedMotion?: boolean;
  maxDpr?: number;
  onStatus?: (status: "loading" | "ready" | "error") => void;
  /** Called when the pointer lands on a part of the brain. */
  onBrainRegion?: (region: BrainRegion | null) => void;
};

export type SimulatorScene = {
  /** The organ levels, by organ, from 0 to 1. */
  setLevels(levels: Record<string, number>): void;
  /** Lights the organ the walkthrough is about. */
  setFocus(organ: FocusOrgan | null): void;
  /** Stops the render loop while the canvas is out of sight. */
  setPaused(paused: boolean): void;
  /** Moves the camera to an organ, or back to the whole body for null. */
  focusOrgan(organ: FocusOrgan | null, immediate?: boolean): void;
  /** Where the focused organ is on the canvas, in CSS pixels. */
  getFocusPoint(): { x: number; y: number } | null;
  /** The brain region under the pointer, and where it is on the canvas. */
  getBrainRegion(): { region: BrainRegion; x: number; y: number } | null;
  /** Whether the model has loaded. */
  isReady(): boolean;
  dispose(): void;
};

const CAMERA_FOV = 32;
const BODY_COLOR = 0x4fb8ff;
const TINT = 0x22d3ee;
const BRAIN_COLOR = 0x9e4d4d;

/** Raw sRGB components — custom shaders write straight to the framebuffer. */
function srgb(hex: number): THREE.Color {
  return new THREE.Color().setRGB(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
}

/** How far back the camera sits to frame a part of the given size. */
function frameDistance(radius: number): number {
  // The camera's vertical field of view, in radians.
  const half = (CAMERA_FOV * Math.PI) / 360;
  // A part fills about half the frame, so the distance is roughly three
  // radii out along the view axis.
  return Math.max(0.55, (radius * 3.2) / Math.tan(half));
}

export function createSimulatorScene(
  canvas: HTMLCanvasElement,
  options: SimulatorSceneOptions = {}
): SimulatorScene {
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
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 100);
  camera.position.set(0, 0, 6.4);

  const hemisphere = new THREE.HemisphereLight(0xbcd8ff, 0x0a1420, 0.7);
  scene.add(hemisphere);
  const directional = new THREE.DirectionalLight(0xd8ecff, 1.1);
  directional.position.set(3, 5, 4);
  scene.add(directional);

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: {
      uColor: { value: srgb(BODY_COLOR) },
      uScan: { value: 1.65 },
    },
    transparent: true,
    depthWrite: false,
  });

  const brainMaterial = new THREE.ShaderMaterial({
    vertexShader: BRAIN_VERTEX,
    fragmentShader: BRAIN_FRAGMENT,
    uniforms: {
      uBase: { value: srgb(BRAIN_COLOR) },
      uTint: { value: srgb(TINT) },
      uFocus: { value: 0 },
      uLightDir: { value: directional.position.clone().normalize() },
      uLightIntensity: { value: directional.intensity },
    },
  });

  const organMaterials = new Map<string, THREE.ShaderMaterial>();
  const makeOrganMaterial = (name: string): THREE.ShaderMaterial => {
    const existing = organMaterials.get(name);
    if (existing) return existing;
    const material = new THREE.ShaderMaterial({
      vertexShader: ORGAN_VERTEX,
      fragmentShader: ORGAN_FRAGMENT,
      uniforms: {
        uBase: { value: srgb(baseFor(name)) },
        uTint: { value: srgb(TINT) },
        uLevel: { value: 0 },
        uFocus: { value: 0 },
        // The camera is close enough here that the organ has to stay
        // recognisable, so the drug shows as brightness and a rim rather
        // than repainting the tissue.
        uTintMix: { value: 0.12 },
        uLightDir: { value: directional.position.clone().normalize() },
        uLightIntensity: { value: directional.intensity },
      },
    });
    organMaterials.set(name, material);
    return material;
  };

  // The model, once it has loaded.
  let model: THREE.Group | null = null;
  let anchors = new Map<string, PartAnchor>();
  let tinted: Array<{ mesh: THREE.Mesh; id: string; material: THREE.ShaderMaterial }> = [];
  let brainTargets: THREE.Mesh[] = [];
  let ready = false;

  // Camera state. The body is centred at the origin, so an un-focused camera
  // sits on the axis.
  const target = new THREE.Vector3(0, 0, 0);
  const wantedTarget = new THREE.Vector3(0, 0, 0);
  let wantedDistance = 6.4;
  let distance = 6.4;
  let focus: FocusOrgan | null = null;
  /**
   * What the caller last asked for.
   *
   * The model arrives after the caller has already asked to focus on
   * something, so the request is kept here and applied when the anatomy
   * lands. Without this the camera would never leave its opening position.
   */
  let wantedLevels: Record<string, number> = {};
  let wantedFocus: FocusOrgan | null = null;

  // A slow drift so the model is not dead still, and so the glass catches
  // the light differently as the visitor watches.
  let drift = 0;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let brainRegion: BrainRegion | null = null;
  /** Where the brain part under the pointer is, in canvas pixels. */
  let brainPoint: { x: number; y: number } | null = null;

  /** A world point, in canvas pixels. */
  function project(world: THREE.Vector3): { x: number; y: number } {
    const point = world.clone().project(camera);
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    return {
      x: (point.x * 0.5 + 0.5) * width,
      y: (-point.y * 0.5 + 0.5) * height,
    };
  }

  /** Reads the anatomical name out of a mesh name: "Cortex_FMA72653_R". */
  function partName(meshName: string): { id: string; name: string } | null {
    const match = /^(?:Cortex|Deep)_(FMA\d+|BP\d+)_[LRM]$/.exec(meshName);
    if (!match) return null;
    const id = match[1];
    const name = BRAIN_PART_NAMES[id];
    return name ? { id, name } : null;
  }

  function pickBrain(clientX: number, clientY: number): void {
    if (!ready || brainTargets.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(brainTargets, false);
    let found: BrainRegion | null = null;
    let point: THREE.Vector3 | null = null;
    for (const hit of hits) {
      const part = partName(hit.object.name);
      if (!part) continue;
      const region = regionOf(part.id, part.name);
      if (!region) continue;
      found = region;
      point = hit.point.clone();
      break;
    }
    brainRegion = found;
    brainPoint = point ? project(point) : null;
    options.onBrainRegion?.(found);
  }

  function clearBrain(): void {
    if (!brainRegion) return;
    brainRegion = null;
    brainPoint = null;
    options.onBrainRegion?.(null);
  }

  const onPointerMove = (event: PointerEvent) => {
    pickBrain(event.clientX, event.clientY);
  };
  const onPointerLeave = () => {
    clearBrain();
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  function resize(): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  let lastFrame = performance.now();
  let raf = 0;
  let disposed = false;
  /** Set when the canvas is off screen or the tab is hidden. */
  let paused = false;
  /** The focus the camera is easing towards, and where it is now. */
  let focusValue = 0;
  let wantedFocusValue = 0;

  function frame(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    if (paused) return;

    if (reducedMotion) {
      target.copy(wantedTarget);
      distance = wantedDistance;
      focusValue = wantedFocusValue;
    } else {
      // Ease towards the wanted framing, so scrolling to the next organ
      // reads as a move rather than a cut.
      target.lerp(wantedTarget, 1 - Math.pow(0.001, dt));
      distance += (wantedDistance - distance) * (1 - Math.pow(0.002, dt));
      // The organ lights as the camera arrives, rather than the instant the
      // step changes.
      focusValue += (wantedFocusValue - focusValue) * (1 - Math.pow(0.001, dt));
    }

    if (!reducedMotion) {
      drift += dt * 0.08;
      // The scan band travels down the body shell, the same sweep the
      // landing figure has. Under reduced motion it parks.
      const phase = (now % 5200) / 5200;
      bodyMaterial.uniforms.uScan.value = 1.65 - phase * 3.3;
    }

    // The focus value drives the shader, so the organ brightens with the
    // camera rather than snapping ahead of it.
    for (const { id, material } of tinted) {
      const wanted = wantedFocus && wantedFocus === id ? 1 : 0;
      material.uniforms.uFocus.value = wanted === 1 ? focusValue : 0;
    }
    brainMaterial.uniforms.uFocus.value = wantedFocus === "brain" ? focusValue : 0;

    camera.position.set(
      target.x + Math.sin(drift) * 0.18,
      target.y + 0.1,
      target.z + distance
    );
    camera.lookAt(target);

    renderer.render(scene, camera);
  }

  // The scene sleeps when it cannot be seen: off screen, or in a hidden tab.
  const onVisibility = () => {
    paused = document.hidden;
    if (!paused) lastFrame = performance.now();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  options.onStatus?.("loading");
  void loadAnatomyModel(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/models/human_anatomy.glb`,
    { body: bodyMaterial, brain: brainMaterial, organ: makeOrganMaterial },
    (error) => {
      console.error("simulator: failed to load human_anatomy.glb", error);
      options.onStatus?.("error");
    }
  )
    .then((loaded) => {
      model = loaded.group;
      anchors = loaded.anchors;
      tinted = loaded.tinted as typeof tinted;
      brainTargets = loaded.brainTargets;
      // The model has no digestive tract, so the gut has no mesh of its own.
      // The gut sits in front of the kidneys, so the camera frames the
      // abdomen there — and the narration says the gut itself is not in the
      // model.
      const kidneys = anchors.get("kidneys");
      if (kidneys) {
        anchors.set("gut", {
          centre: kidneys.centre.clone(),
          radius: kidneys.radius * 0.8,
        });
      }
      scene.add(model);
      ready = true;
      // The caller asked for a framing before the anatomy was here. Apply it
      // now, or the camera would never move.
      applyLevels(wantedLevels);
      applyFocus(wantedFocus);
      applyFraming(wantedFocus, false);
      options.onStatus?.("ready");
    })
    .catch(() => {
      options.onStatus?.("error");
    });

  function applyLevels(levels: Record<string, number>): void {
    for (const { id, material } of tinted) {
      const value = levels[id];
      material.uniforms.uLevel.value =
        value === undefined ? 0 : Math.min(1, Math.max(0, value));
    }
  }

  function applyFocus(organ: FocusOrgan | null): void {
    // The organ the walkthrough is about burns brighter than the ones it is
    // passing. The brain is one material for all 64 of its parts, so it is
    // lit as a whole. The value itself is eased in the frame loop, so the
    // organ lights as the camera arrives.
    wantedFocusValue = organ ? 1 : 0;
    if (reducedMotion) focusValue = wantedFocusValue;
  }

  function applyFraming(organ: FocusOrgan | null, immediate: boolean): void {
    focus = organ;
    if (!organ) {
      wantedTarget.set(0, 0, 0);
      wantedDistance = 6.4;
    } else {
      const anchor = anchors.get(organ);
      if (!anchor) return;
      wantedTarget.copy(anchor.centre);
      wantedDistance = frameDistance(anchor.radius);
    }
    if (immediate || reducedMotion) {
      target.copy(wantedTarget);
      distance = wantedDistance;
    }
  }

  return {
    setLevels(levels) {
      wantedLevels = levels;
      applyLevels(levels);
    },

    setFocus(organ) {
      wantedFocus = organ;
      applyFocus(organ);
    },

    setPaused(next) {
      paused = next || document.hidden;
      if (!paused) lastFrame = performance.now();
    },

    focusOrgan(organ, immediate = false) {
      applyFraming(organ, immediate);
    },

    getFocusPoint() {
      if (!focus) return null;
      const anchor = anchors.get(focus);
      if (!anchor) return null;
      const point = anchor.centre.clone().project(camera);
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      return {
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
      };
    },

    getBrainRegion() {
      if (!brainRegion || !brainPoint) return null;
      return { region: brainRegion, x: brainPoint.x, y: brainPoint.y };
    },

    isReady() {
      return ready;
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
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      bodyMaterial.dispose();
      brainMaterial.dispose();
      for (const material of organMaterials.values()) material.dispose();
      renderer.dispose();
    },
  };
}

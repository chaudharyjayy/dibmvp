"use client";

/** BrainHologram — a spinning, volumetric-looking brain rendered with Three.js.
 *
 *  The mesh is generated procedurally (no external asset): two hemispheres with
 *  fractal-ish surface folds, drawn as an additive wireframe grid inside a faint
 *  glowing shell, plus a sparse particle cloud. Regions are clickable — a raycast
 *  hit is converted into brain-local space and classified into a lobe.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface BrainRegion {
  /** Stable identifier for the region. */
  id: string;
  /** Human-readable name, e.g. "Frontal lobe". */
  label: string;
  /** "Left" | "Right" | "" for midline structures. */
  side: "Left" | "Right" | "Midline";
  /** Full display label, e.g. "Frontal lobe · left hemisphere". */
  display: string;
}

export interface BrainHologramProps {
  /** Accent colour for every element of the hologram. */
  color?: string;
  /** Continuously rotate around the vertical axis. */
  autoRotate?: boolean;
  /** Radians per second when `autoRotate` is on. */
  rotationSpeed?: number;
  /** Allow lobes to be hovered and clicked. */
  clickable?: boolean;
  className?: string;
  /** Called when a region is chosen. */
  onRegionSelect?: (region: BrainRegion) => void;
  /** Called when the pointer moves onto/off a region. */
  onRegionHover?: (region: BrainRegion | null) => void;
}

const LAT_SEGMENTS = 56;
const LON_SEGMENTS = 44;
const GRID_LAT_STEP = 4;
const GRID_LON_STEP = 4;

/** Maps a (latitude, longitude) pair on the unit sphere onto the brain surface. */
function shape(lat: number, lon: number, out: THREE.Vector3): THREE.Vector3 {
  const cosLat = Math.cos(lat);
  const nx = cosLat * Math.cos(lon);
  const ny = Math.sin(lat);
  const nz = cosLat * Math.sin(lon);

  // Layered sine products stand in for cortical folds.
  const folds =
    0.085 * Math.sin(nx * 8.1 + 1.3) * Math.sin(ny * 9.7 + 0.6) * Math.sin(nz * 8.9 + 2.4) +
    0.042 * Math.sin(nx * 16.9 + 0.2) * Math.sin(nz * 15.3 + 1.1) +
    0.022 * Math.sin(ny * 23.0 + 0.9) * Math.sin(nx * 27.0);

  const r = 1 + folds;

  let x = nx * r;
  let y = ny * r;
  let z = nz * r;

  // Ellipsoid proportions: slightly narrow, squat, long front-to-back.
  x *= 0.94;
  y *= 0.84;
  z *= 1.16;

  // Flatten the underside so it reads as a brain rather than a ball.
  if (y < -0.5) y = -0.5 + (y + 0.5) * 0.45;

  return out.set(x, y, z);
}

function lonRange(side: -1 | 1): [number, number] {
  return side === 1 ? [-Math.PI / 2, Math.PI / 2] : [Math.PI / 2, (3 * Math.PI) / 2];
}

/** Solid hemisphere surface. */
function buildHemisphereSurface(side: -1 | 1): THREE.BufferGeometry {
  const [lonStart] = lonRange(side);
  const positions: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();

  for (let i = 0; i <= LAT_SEGMENTS; i += 1) {
    const lat = -Math.PI / 2 + (i / LAT_SEGMENTS) * Math.PI;
    for (let j = 0; j <= LON_SEGMENTS; j += 1) {
      const lon = lonStart + (j / LON_SEGMENTS) * Math.PI;
      shape(lat, lon, v);
      // Fissure: pull each hemisphere away from the midline.
      positions.push(v.x + side * 0.028, v.y, v.z);
    }
  }

  const stride = LON_SEGMENTS + 1;
  for (let i = 0; i < LAT_SEGMENTS; i += 1) {
    for (let j = 0; j < LON_SEGMENTS; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Coarse latitude/longitude grid that follows the folded surface. */
function buildHemisphereGrid(side: -1 | 1): THREE.BufferGeometry {
  const [lonStart] = lonRange(side);
  const segments: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const offset = side * 0.028;

  const pointAt = (latIndex: number, lonIndex: number, out: THREE.Vector3) => {
    const lat = -Math.PI / 2 + (latIndex / LAT_SEGMENTS) * Math.PI;
    const lon = lonStart + (lonIndex / LON_SEGMENTS) * Math.PI;
    shape(lat, lon, out);
    out.x += offset;
    return out;
  };

  for (let i = 0; i <= LAT_SEGMENTS; i += GRID_LAT_STEP) {
    for (let j = 0; j < LON_SEGMENTS; j += 1) {
      pointAt(i, j, a);
      pointAt(i, j + 1, b);
      segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  for (let j = 0; j <= LON_SEGMENTS; j += 2 * GRID_LON_STEP) {
    for (let i = 0; i < LAT_SEGMENTS; i += 1) {
      pointAt(i, j, a);
      pointAt(i + 1, j, b);
      segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

/** Solid, slightly folded body for the cerebellum. */
function buildCerebellumSurface(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 44, 28);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    // Horizontal folia: tight ripples stacked along the vertical axis.
    const folia =
      0.045 * Math.sin(v.y * 24) + 0.03 * Math.sin(v.x * 12 + v.z * 9);
    v.multiplyScalar(1 + folia);
    position.setXYZ(i, v.x, v.y, v.z);
  }

  position.needsUpdate = true;
  geometry.scale(0.56, 0.3, 0.4);
  geometry.translate(0, -0.36, -0.78);
  geometry.computeVertexNormals();
  return geometry;
}

/** Tapered brainstem running from the underside toward the spinal cord. */
function buildBrainstemSurface(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.15, 0.085, 0.46, 26, 6, false);
  geometry.rotateX(-0.12);
  geometry.translate(0, -0.6, 0.06);
  geometry.computeVertexNormals();
  return geometry;
}

/** Classifies a point in brain-local space into a lobe. */
function classifyRegion(point: THREE.Vector3): BrainRegion {
  const side: BrainRegion["side"] =
    point.x > 0.06 ? "Right" : point.x < -0.06 ? "Left" : "Midline";

  let label: string;
  if (point.y < -0.28 && point.z < -0.05) {
    label = "Cerebellum";
  } else if (point.y < -0.18 && point.z > 0.1) {
    label = "Brainstem";
  } else if (point.z < -0.52) {
    label = "Occipital lobe";
  } else if (point.z > 0.42) {
    label = "Frontal lobe";
  } else if (point.y > 0.26) {
    label = "Parietal lobe";
  } else {
    label = "Temporal lobe";
  }

  const id = `${label}-${side}`.toLowerCase().replace(/\s+/g, "-");
  const display =
    side === "Midline" ? label : `${label} · ${side.toLowerCase()} hemisphere`;

  return { id, label, side, display };
}

export function BrainHologram({
  color = "#ff3b30",
  autoRotate = true,
  rotationSpeed = 0.42,
  clickable = true,
  className = "",
  onRegionSelect,
  onRegionHover,
}: BrainHologramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [activeRegion, setActiveRegion] = useState<BrainRegion | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<BrainRegion | null>(null);

  const colorRef = useRef(color);
  colorRef.current = color;
  const clickableRef = useRef(clickable);
  clickableRef.current = clickable;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const speedRef = useRef(rotationSpeed);
  speedRef.current = rotationSpeed;
  const onSelectRef = useRef(onRegionSelect);
  onSelectRef.current = onRegionSelect;
  const onHoverRef = useRef(onRegionHover);
  onHoverRef.current = onRegionHover;

  // Recolour without rebuilding the scene.
  const materialsRef = useRef<THREE.Material[]>([]);
  // Opaque brain body: dark accent-tinted base with an accent emissive glow.
  const bodyMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  // Accent-tinted lights that wrap the solid body in colour.
  const accentLightsRef = useRef<THREE.Light[]>([]);

  useEffect(() => {
    const accent = new THREE.Color(color);
    for (const material of materialsRef.current) {
      const withColor = material as THREE.Material & { color?: THREE.Color };
      withColor.color?.set(accent);
      const emissive = material as THREE.Material & { emissive?: THREE.Color };
      emissive.emissive?.set(accent);
    }
    for (const material of bodyMaterialsRef.current) {
      material.color.copy(accent).multiplyScalar(0.18);
      material.emissive.copy(accent);
    }
    for (const light of accentLightsRef.current) {
      light.color.copy(accent);
    }
  }, [color]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglFailed(true);
      return;
    }

    const accent = new THREE.Color(colorRef.current);
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.55, 3.55);
    camera.lookAt(0, 0, 0);

    const brain = new THREE.Group();
    scene.add(brain);

    const disposables: Array<{ dispose: () => void }> = [];
    const materials: THREE.Material[] = [];

    // Lighting for the solid body that sits inside the particle shell.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.32);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(2.6, 3.4, 3.2);
    const fillLight = new THREE.DirectionalLight(accent, 0.9);
    fillLight.position.set(-3.2, 0.5, 1.8);
    const rimLight = new THREE.DirectionalLight(accent, 1.6);
    rimLight.position.set(-0.7, 1.4, -3.4);
    scene.add(ambientLight, keyLight, fillLight, rimLight);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.18),
      emissive: accent,
      emissiveIntensity: 0.2,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
    materials.push(bodyMaterial);

    const shellMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const gridMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pointMaterial = new THREE.PointsMaterial({
      color: accent,
      size: 0.016,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    materials.push(shellMaterial, gridMaterial, pointMaterial);

    const hitTargets: THREE.Mesh[] = [];

    for (const side of [-1, 1] as const) {
      const surfaceGeometry = buildHemisphereSurface(side);
      const gridGeometry = buildHemisphereGrid(side);

      // Solid body, inset just under the dot shell so the cloud reads as a
      // surface over a real brain rather than an empty shell.
      const body = new THREE.Mesh(surfaceGeometry, bodyMaterial);
      body.scale.setScalar(0.965);
      brain.add(body);
      hitTargets.push(body);

      const shell = new THREE.Mesh(surfaceGeometry, shellMaterial);
      brain.add(shell);
      hitTargets.push(shell);

      const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
      brain.add(grid);

      const points = new THREE.Points(surfaceGeometry, pointMaterial);
      brain.add(points);

      disposables.push(surfaceGeometry, gridGeometry);
    }

    // Hindbrain and stem close the silhouette below the hemispheres.
    const cerebellumGeometry = buildCerebellumSurface();
    const cerebellum = new THREE.Mesh(cerebellumGeometry, bodyMaterial);
    brain.add(cerebellum);
    hitTargets.push(cerebellum);
    disposables.push(cerebellumGeometry);

    const brainstemGeometry = buildBrainstemSurface();
    const brainstem = new THREE.Mesh(brainstemGeometry, bodyMaterial);
    brain.add(brainstem);
    hitTargets.push(brainstem);
    disposables.push(brainstemGeometry);

    // Equatorial reference ring, like a scanner trace.
    const ringGeometry = new THREE.RingGeometry(1.02, 1.045, 128);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.02;
    brain.add(ring);
    disposables.push(ringGeometry);
    materials.push(ringMaterial);

    // A marker that highlights the region under the pointer.
    const markerGeometry = new THREE.SphereGeometry(0.028, 12, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.95,
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.visible = false;
    brain.add(marker);
    disposables.push(markerGeometry);
    materials.push(markerMaterial);

    // Only the translucent accents are recoloured to the raw accent colour;
    // the solid body keeps its darkened base and is handled separately.
    materialsRef.current = [
      shellMaterial,
      gridMaterial,
      pointMaterial,
      ringMaterial,
      markerMaterial,
    ];
    bodyMaterialsRef.current = [bodyMaterial];
    accentLightsRef.current = [fillLight, rimLight];

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const lastHoverId = { current: "" as string };
    let pointerInside = false;

    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pick = (): BrainRegion | null => {
      if (!clickableRef.current) return null;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitTargets, false);
      if (hits.length === 0) return null;
      const hit = hits[0];
      const local = brain.worldToLocal(hit.point.clone());
      marker.position.copy(local);
      marker.visible = true;
      return classifyRegion(local);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerInside = true;
      updatePointer(event);
      const region = pick();
      const nextId = region?.id ?? "";
      if (nextId === lastHoverId.current) return;
      lastHoverId.current = nextId;
      setHoveredRegion(region);
      onHoverRef.current?.(region);
      renderer.domElement.style.cursor = region ? "pointer" : "default";
    };

    const handlePointerLeave = () => {
      pointerInside = false;
      marker.visible = false;
      if (lastHoverId.current !== "") {
        lastHoverId.current = "";
        setHoveredRegion(null);
        onHoverRef.current?.(null);
      }
      renderer.domElement.style.cursor = "default";
    };

    const handleClick = (event: PointerEvent) => {
      updatePointer(event);
      const region = pick();
      if (!region) {
        setActiveRegion(null);
        return;
      }
      setActiveRegion(region);
      onSelectRef.current?.(region);
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const clock = { last: performance.now(), elapsed: 0 };
    let frameId = 0;
    let disposed = false;

    const paint = () => {
      renderer.render(scene, camera);
    };

    const renderFrame = () => {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min(0.05, (now - clock.last) / 1000);
      clock.last = now;
      clock.elapsed += delta;
      const elapsed = clock.elapsed;

      if (autoRotateRef.current) {
        brain.rotation.y += delta * speedRef.current;
      }

      // A slow bob and tilt keeps it feeling volumetric rather than flat.
      brain.position.y = Math.sin(elapsed * 0.55) * 0.045;
      brain.rotation.z = Math.sin(elapsed * 0.31) * 0.045;

      if (pointerInside && clickableRef.current) {
        marker.visible = true;
      }

      paint();

      frameId = requestAnimationFrame(renderFrame);
    };

    // Paint one frame immediately so the brain is visible before the animation
    // loop starts, including in background tabs where rAF is throttled.
    paint();
    frameId = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("click", handleClick);
      for (const item of disposables) item.dispose();
      for (const material of materials) material.dispose();
      materialsRef.current = [];
      bodyMaterialsRef.current = [];
      accentLightsRef.current = [];
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const readout = hoveredRegion ?? activeRegion;

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-400">
          This browser could not start WebGL, so the 3D brain cannot be drawn.
        </div>
      )}

      {readout && (
        <div
          className="pointer-events-none absolute bottom-6 left-6 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-xs font-medium text-zinc-100 backdrop-blur"
          role="status"
          aria-live="polite"
        >
          {readout.display}
        </div>
      )}
    </div>
  );
}

export default BrainHologram;

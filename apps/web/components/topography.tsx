"use client";

/** Topography — a flowing contour line-field rendered into its own canvas.
 *
 *  Props mirror the drop-in usage:
 *
 *      <Topography
 *        color="#4f7cff" lineCount={22} lineWidth={1.2} elevation={1}
 *        foreground={0.2} tilt={32} speed={0.25} direction="forward"
 *        glow={0.6} depthOfField={0.4} fog={0.35}
 *        hoverEffect="lift" clickEffect="pulse"
 *      />
 *
 *  The scene itself is built by `createTopographyField`, so the same visual can
 *  also be instanced inside another renderer (see `blood-flow.tsx`).
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  createTopographyField,
  type TopographyClickEffect,
  type TopographyDirection,
  type TopographyField,
  type TopographyHoverEffect,
  type TopographyShape,
} from "./topography-field";

export interface TopographyProps {
  /** Line colour. */
  color?: string;
  /** Number of contour lines. */
  lineCount?: number;
  /** Requested line width. WebGL clamps 1px lines, so >1 draws an additive halo. */
  lineWidth?: number;
  /** Wave amplitude. */
  elevation?: number;
  /** 0..1 — how strongly the near lines dominate. */
  foreground?: number;
  /** Degrees of tilt around the horizontal axis. */
  tilt?: number;
  /** Animation speed multiplier. */
  speed?: number;
  direction?: TopographyDirection;
  /** 0..1 — additive halo strength. */
  glow?: number;
  /** 0..1 — how quickly distant lines fade. */
  depthOfField?: number;
  /** 0..1 — fog density. */
  fog?: number;
  hoverEffect?: TopographyHoverEffect;
  clickEffect?: TopographyClickEffect;
  /** Shape of the field; defaults to the flowing landscape. */
  shape?: TopographyShape;
  /** World-space size of the field. */
  size?: number;
  /** Overall line opacity. */
  opacity?: number;
  className?: string;
}

export default function Topography({
  color = "#4f7cff",
  lineCount = 22,
  lineWidth = 1.2,
  elevation = 1,
  foreground = 0.2,
  tilt = 32,
  speed = 0.25,
  direction = "forward",
  glow = 0.6,
  depthOfField = 0.4,
  fog = 0.35,
  hoverEffect = "lift",
  clickEffect = "pulse",
  shape = "landscape",
  size = 6,
  opacity = 1,
  className = "",
}: TopographyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<TopographyField | null>(null);
  const colorRef = useRef(color);
  colorRef.current = color;

  // Construction options, read once on mount; `speed` is read live instead.
  const options = {
    lineCount,
    lineWidth,
    elevation,
    foreground,
    tilt,
    speed,
    direction,
    glow,
    depthOfField,
    fog,
    hoverEffect,
    clickEffect,
    shape,
    size,
    opacity,
  };
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Recolour without rebuilding the scene.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const accent = new THREE.Color(color);
    field.group.traverse((object) => {
      const line = object as THREE.LineSegments;
      if (line.material instanceof THREE.LineBasicMaterial) {
        line.material.color.copy(accent);
      }
    });
  }, [color]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL unavailable; the component simply renders nothing.
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const o = optionsRef.current;
    const accent = new THREE.Color(colorRef.current);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(
      new THREE.Color(colorRef.current).multiplyScalar(0.05).getHex(),
      o.fog * 0.09,
    );

    // Pull the camera back until the whole field fits the vertical FOV.
    const fov = 52;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 200);
    const fitDistance =
      (o.size * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) + o.size * 0.35;
    camera.position.set(0, o.size * 0.22, fitDistance);
    camera.lookAt(0, 0, 0);

    const field = createTopographyField({ ...o, color: colorRef.current });
    field.group.traverse((object) => {
      const line = object as THREE.LineSegments;
      if (line.material instanceof THREE.LineBasicMaterial) {
        line.material.color.copy(accent);
      }
    });
    scene.add(field.group);
    fieldRef.current = field;

    // Fog distance scales with the field size.
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = (o.depthOfField * 0.5 + o.fog) / (o.size * 2.2);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInside = false;

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInside = true;
      if (o.hoverEffect === "none") return;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(field.group, true).length > 0;
      field.setHover(hit);
    };

    const onPointerLeave = () => {
      pointerInside = false;
      field.setHover(false);
    };

    const onPointerDown = () => {
      if (!pointerInside) return;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.intersectObject(field.group, true).length > 0) field.pulse();
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = { last: performance.now(), elapsed: 0 };
    let frameId = 0;
    let disposed = false;

    const renderFrame = () => {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min(0.05, (now - clock.last) / 1000);
      clock.last = now;
      // `speed` is a live prop; scale the accumulated time by its ratio.
      clock.elapsed += delta * (reduceMotion ? 0.25 : speedRef.current / 0.25);

      field.update(clock.elapsed);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    };

    field.update(0);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      fieldRef.current = null;
      scene.remove(field.group);
      field.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      aria-hidden
    />
  );
}

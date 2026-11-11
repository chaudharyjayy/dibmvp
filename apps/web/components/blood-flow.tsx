"use client";

/** BloodFlow — scroll-driven flythrough of a blood vessel.
 *
 *  Scroll progress through the section drives the flow speed and the camera
 *  dolly; red blood cells are drawn as topography line fields so they match the
 *  contour language of the brain hologram.
 */

import { useEffect, useRef } from "react";
import { createTopographyField, type TopographyField } from "./topography-field";
import * as THREE from "three";

export interface BloodFlowProps {
  /** Accent colour, shared with the page theme. */
  color?: string;
  /** Optional class for the outer section. */
  className?: string;
}

const VESSEL_LENGTH = 46;
const VESSEL_RADIUS = 2.45;
const CELL_COUNT = 18;

export default function BloodFlow({ color = "#ff3b30", className = "" }: BloodFlowProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const colorRef = useRef(color);
  colorRef.current = color;

  // Scroll progress through the pinned section, 0 at the top edge → 1 at the end.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const read = () => {
      const rect = section.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const value = span > 0 ? -rect.top / span : 0;
      progressRef.current = Math.min(1, Math.max(0, value));
    };

    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  // Recolour without rebuilding the scene.
  const materialsRef = useRef<THREE.LineBasicMaterial[]>([]);
  useEffect(() => {
    const accent = new THREE.Color(color);
    for (const material of materialsRef.current) material.color.copy(accent);
  }, [color]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
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

    const accent = new THREE.Color(colorRef.current);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0203, 0.035);

    const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 140);
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, -6);

    const world = new THREE.Group();
    scene.add(world);

    const disposables: Array<{ dispose: () => void }> = [];
    const materials: THREE.LineBasicMaterial[] = [];

    // Vessel wall: wall rings plus longitudinal fibres.
    const wallMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const fibreMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    materials.push(wallMaterial, fibreMaterial);

    const rings: THREE.LineLoop[] = [];
    const RING_COUNT = 30;
    for (let i = 0; i < RING_COUNT; i += 1) {
      const radius = VESSEL_RADIUS * (0.86 + 0.14 * Math.sin((i / RING_COUNT) * Math.PI * 3));
      const points: THREE.Vector3[] = [];
      for (let j = 0; j < 72; j += 1) {
        const angle = (j / 72) * Math.PI * 2;
        // Slight lobing keeps the wall from reading as a perfect tube.
        const r = radius * (1 + 0.05 * Math.sin(angle * 5 + i * 0.4));
        points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const ring = new THREE.LineLoop(geometry, wallMaterial);
      ring.position.z = -(i / RING_COUNT) * VESSEL_LENGTH;
      world.add(ring);
      rings.push(ring);
      disposables.push(geometry);
    }

    const FIBRE_COUNT = 14;
    for (let i = 0; i < FIBRE_COUNT; i += 1) {
      const angle = (i / FIBRE_COUNT) * Math.PI * 2;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 12; j += 1) {
        const z = -(j / 12) * VESSEL_LENGTH;
        const r = VESSEL_RADIUS * (1 + 0.03 * Math.sin(j * 0.9 + i));
        points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      world.add(new THREE.Line(geometry, fibreMaterial));
      disposables.push(geometry);
    }

    // Red blood cells: biconcave discs drawn as contour rings.
    const cells: Array<{
      field: TopographyField;
      baseZ: number;
      drift: number;
      spin: THREE.Vector3;
    }> = [];

    for (let i = 0; i < CELL_COUNT; i += 1) {
      const field = createTopographyField({
        color: colorRef.current,
        shape: "erythrocyte",
        size: 1.15,
        lineCount: 11,
        lineWidth: 2.6,
        elevation: 2.2,
        foreground: 0.4,
        tilt: 52,
        glow: 0.8,
        opacity: 1,
        hoverEffect: "none",
        clickEffect: "none",
      });

      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * (VESSEL_RADIUS * 0.68);
      field.group.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      field.group.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      world.add(field.group);

      field.group.traverse((object) => {
        const line = object as THREE.LineSegments;
        if (line.material instanceof THREE.LineBasicMaterial) {
          materials.push(line.material);
        }
      });

      cells.push({
        field,
        baseZ: -(i / CELL_COUNT) * VESSEL_LENGTH,
        drift: 0.35 + Math.random() * 0.5,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.35,
        ),
      });
    }

    materialsRef.current = materials;

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
    let travel = 0;
    let frameId = 0;
    let disposed = false;

    const wrap = (value: number) => {
      const span = VESSEL_LENGTH;
      return -((((value % span) + span) % span));
    };

    const renderFrame = () => {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min(0.05, (now - clock.last) / 1000);
      clock.last = now;
      clock.elapsed += delta;
      const time = clock.elapsed;

      // Scroll pushes the flow faster and dollies the camera into the vessel.
      const progress = progressRef.current;
      const speed = reduceMotion ? 0.5 : 1.8 + progress * 7.5;
      travel += delta * speed;

      for (const ring of rings) {
        ring.position.z = wrap(ring.position.z + delta * speed);
      }

      for (const cell of cells) {
        cell.field.update(time + cell.drift);
        cell.field.group.position.z = wrap(cell.baseZ + travel);
        cell.field.group.rotation.x += delta * cell.spin.x;
        cell.field.group.rotation.y += delta * cell.spin.y;
        cell.field.group.rotation.z += delta * cell.spin.z;

        const z = cell.field.group.position.z;
        // Fade cells as they pass the camera and as they appear far away.
        const nearFade = THREE.MathUtils.smoothstep(z, 3.4, 1.1);
        const farFade = 1 - THREE.MathUtils.smoothstep(-z, 26, VESSEL_LENGTH);
        cell.field.setOpacity(0.15 + 0.85 * Math.min(nearFade, farFade));
      }

      camera.position.z = 4.2 - progress * 1.5;
      camera.position.x = Math.sin(time * 0.25) * 0.12;
      camera.position.y = Math.cos(time * 0.2) * 0.1;
      camera.lookAt(0, 0, -6);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    };

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      for (const cell of cells) cell.field.dispose();
      for (const item of disposables) item.dispose();
      for (const material of materials) material.dispose();
      materialsRef.current = [];
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`relative w-full bg-[#050506] ${className}`}
      style={{ height: "260svh" }}
      aria-label="Blood flow"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050506] to-transparent" />
      </div>
    </section>
  );
}

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildBrainGeometry, countBrainTriangles } from "../components/landing/brain-geometry";

/**
 * The brain is illustrative, so these tests pin the properties the scene
 * depends on rather than anatomical accuracy: a closed, watertight surface,
 * a deterministic mesh, a sane triangle budget, and geometry that fits inside
 * the cranium it is placed in.
 */
describe("brain geometry", () => {
  it("is deterministic: the same call returns the same positions", () => {
    const a = buildBrainGeometry();
    const b = buildBrainGeometry();
    const positionsA = a.cerebrum.getAttribute("position");
    const positionsB = b.cerebrum.getAttribute("position");
    expect(positionsA.count).toBe(positionsB.count);
    for (let i = 0; i < positionsA.count; i += 1) {
      expect(positionsA.getX(i)).toBeCloseTo(positionsB.getX(i), 12);
      expect(positionsA.getY(i)).toBeCloseTo(positionsB.getY(i), 12);
      expect(positionsA.getZ(i)).toBeCloseTo(positionsB.getZ(i), 12);
    }
  });

  it("has no NaN or infinite positions", () => {
    const brain = buildBrainGeometry();
    for (const part of brain.all) {
      const position = part.getAttribute("position");
      for (let i = 0; i < position.count; i += 1) {
        expect(Number.isFinite(position.getX(i))).toBe(true);
        expect(Number.isFinite(position.getY(i))).toBe(true);
        expect(Number.isFinite(position.getZ(i))).toBe(true);
      }
    }
  });

  it("stays inside the figure's triangle budget", () => {
    // The body figure is ~11k triangles against a 12k budget; the brain
    // lives inside the head, which is a few percent of the frame, so it does
    // not need the tessellation a hero-scale model would.
    expect(countBrainTriangles(buildBrainGeometry())).toBeLessThan(8000);
  });

  it("is centred on the origin, so it can be scaled to fit the cranium", () => {
    const brain = buildBrainGeometry();
    const bounds = new THREE.Box3();
    for (const part of brain.all) {
      part.computeBoundingBox();
      if (part.boundingBox) bounds.union(part.boundingBox);
    }
    const centre = bounds.getCenter(new THREE.Vector3());
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.y).toBeCloseTo(0, 6);
    expect(centre.z).toBeCloseTo(0, 6);
  });

  it("is wider than it is tall, and deeper than it is wide", () => {
    // A brain is longer front-to-back than it is wide, and wider than tall.
    const { halfExtents } = buildBrainGeometry();
    expect(halfExtents.z).toBeGreaterThan(halfExtents.x);
    expect(halfExtents.x).toBeGreaterThan(halfExtents.y);
  });

  it("carries the per-vertex tone the sulcal shading reads", () => {
    const brain = buildBrainGeometry();
    for (const part of brain.all) {
      const tone = part.getAttribute("aTone");
      expect(tone).toBeDefined();
      expect(tone.count).toBe(part.getAttribute("position").count);
      for (let i = 0; i < tone.count; i += 1) {
        expect(tone.getX(i)).toBeGreaterThanOrEqual(0);
        expect(tone.getX(i)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("varies the tone across the cortex, so the folds are visible", () => {
    const tone = buildBrainGeometry().cerebrum.getAttribute("aTone");
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < tone.count; i += 1) {
      const value = tone.getX(i);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    // Some spread means sulci and gyral crowns are distinguishable.
    expect(max - min).toBeGreaterThan(0.1);
  });

  it("ships a smooth pre-fold normal for the rim", () => {
    const brain = buildBrainGeometry();
    for (const part of brain.all) {
      const baseNormal = part.getAttribute("baseNormal");
      expect(baseNormal).toBeDefined();
      expect(baseNormal.count).toBe(part.getAttribute("position").count);
    }
  });
});

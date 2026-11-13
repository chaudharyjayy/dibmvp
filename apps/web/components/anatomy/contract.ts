/**
 * The anatomy model: what the GLB contains, and what the app does with each
 * part.
 *
 * The model is the real anatomy: a glass skin, the cerebral cortex and deep
 * brain as 62 named parts, the lungs, the heart, the liver, the kidneys, the
 * airway and the great vessels. This module is the single place that says
 * which node is which, so the landing figure and the simulator cannot drift
 * apart.
 *
 * Node names are the contract with `scripts/anatomy/export-web.py`.
 */

import type { OrganId } from "@/components/landing/dial";

/** Node names as the glTF exporter wrote them. */
export const GLB = {
  body: "Body",
  heart: ["Heart"],
  liver: ["Liver"],
  lungs: ["Lung_L", "Lung_R"],
  kidneys: ["Kidney_L", "Kidney_R"],
  /** The brain is 35 named gyri and 27 named nuclei, plus the cerebellum and
   *  the brainstem. They are matched by prefix because the exact set is the
   *  anatomy's, not the app's. */
  brainPrefixes: ["Cortex_", "Deep_"],
  brainExtras: ["Cerebellum", "BrainStem"],
  airway: ["Trachea", "Bronchus_L", "Bronchus_R"],
  /** The great vessels, the heart's coronaries and the great cardiac veins.
   *  They all carry the blood shape. */
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

/**
 * The visual group a node belongs to when one organ is shown on its own.
 *
 * This is a VISUAL grouping, deliberately not the tint contract (FOLLOW):
 * the vessels tint with the blood, but when the liver or the kidneys are
 * isolated they leave with the field. The brain is the brain; the airway
 * belongs to the lungs; the renal hilum belongs to the kidneys; the rest of
 * the vascular tree stays with the heart. The gut has no mesh — it is
 * absent from the model — so it never appears here.
 */
export type IsolationGroup = "brain" | "heart" | "lungs" | "liver" | "kidneys";

export function isolationOf(name: string): IsolationGroup | null {
  if (isBrainMesh(name)) return "brain";
  if (name === "Liver") return "liver";
  if (name === "Lung_L" || name === "Lung_R") return "lungs";
  if ((GLB.airway as readonly string[]).includes(name)) return "lungs";
  if (
    name === "Kidney_L" ||
    name === "Kidney_R" ||
    name.startsWith("RenalArtery_") ||
    name.startsWith("RenalVein_")
  ) {
    return "kidneys";
  }
  if (
    name === "Heart" ||
    name === "Brachiocephalic" ||
    name === "PulmonaryArtery" ||
    name === "PulmonaryVein" ||
    name.startsWith("Aorta_") ||
    name.startsWith("Carotid_") ||
    name.startsWith("Subclavian_") ||
    name.startsWith("BrachioVein_") ||
    name.startsWith("JugularVein_") ||
    name.startsWith("VenaCava_") ||
    name.startsWith("CommonIliac_") ||
    name.startsWith("Coronary_") ||
    name.startsWith("Cardiac_")
  ) {
    return "heart";
  }
  return null;
}

/** True for a node that is part of the brain. */
export function isBrainMesh(name: string): boolean {
  if (GLB.brainExtras.includes(name as (typeof GLB.brainExtras)[number])) return true;
  return GLB.brainPrefixes.some((prefix) => name.startsWith(prefix));
}

/** Which dial organ each mesh follows. Vessels carry the blood shape. */
export const FOLLOW: Record<string, OrganId> = {
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

/**
 * The nodes that make up each organ, for focusing the camera on it.
 *
 * The heart, liver, lungs and kidneys are single or paired nodes. The brain
 * is 64 of them, so it is matched by prefix instead.
 */
export const ORGAN_NODES: Record<Exclude<OrganId, "stomach" | "gut">, string[] | null> = {
  heart: ["Heart"],
  liver: ["Liver"],
  lungs: ["Lung_L", "Lung_R"],
  kidneys: ["Kidney_L", "Kidney_R"],
};

/**
 * Base colour per node group, raw sRGB.
 *
 * These came out of the .blend as the tissue's own colours, but those are
 * near-black on a dark panel, so each one is lifted here until it reads.
 */
export const BASE: Record<string, number> = {
  heart: 0x7d0f13,
  liver: 0x5c1c18,
  lung: 0xa83e44,
  kidney: 0x6a1f22,
  artery: 0x9e0e0e,
  vein: 0x16227a,
  brain: 0x9e4d4d,
  // The airway carries no drug and is only scaffolding, so it is drawn dim
  // rather than as a white tube that outshines the organs.
  airway: 0x8e97a6,
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

/** The tissue colour a node is drawn in. */
export function baseFor(name: string): number {
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

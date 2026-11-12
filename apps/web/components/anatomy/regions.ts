/**
 * Brain regions: what part of the brain a click landed on.
 *
 * The model is built from real anatomy, so the answer is not guessed from
 * coordinates — the cortex arrives as named gyri and lobes ("right superior
 * frontal gyrus", "left occipital lobe"), and the region is read off the part
 * that was hit.
 *
 * This module is kept free of Three.js and React so the classification can be
 * tested on its own.
 */

/** A stable identifier for the region. */
export type BrainRegionId =
  | "frontal"
  | "parietal"
  | "temporal"
  | "occipital"
  | "cerebellum"
  | "brainstem"
  | "deep";

export type BrainRegion = {
  id: BrainRegionId;
  /** Human-readable name, e.g. "Frontal lobe". */
  label: string;
  /** "Left" | "Right" | "Midline" for structures that span both sides. */
  side: "Left" | "Right" | "Midline";
  /** Full display label, e.g. "Frontal lobe · left hemisphere". */
  display: string;
  /** The anatomical name of the part that was hit, e.g. "superior frontal gyrus". */
  part: string;
};

export const REGION_LABELS: Record<BrainRegionId, string> = {
  frontal: "Frontal lobe",
  parietal: "Parietal lobe",
  temporal: "Temporal lobe",
  occipital: "Occipital lobe",
  cerebellum: "Cerebellum",
  brainstem: "Brainstem",
  deep: "Deep brain structures",
};

/**
 * Classifies a part by its anatomical name.
 *
 * The names come from the Foundational Model of Anatomy, so the classification
 * is by word rather than by geometry: "left occipital lobe" is occipital, and
 * "anterior part of right superior temporal gyrus" is temporal.
 *
 * Returns null for a name that is not a brain part, so a stray mesh does not
 * report a region it does not have.
 */
export function classifyPart(id: string, name: string): BrainRegionId | null {
  const lower = name.toLowerCase();

  if (lower.includes("cerebell")) return "cerebellum";
  if (
    lower.includes("pons") ||
    lower.includes("medulla") ||
    lower.includes("midbrain") ||
    lower.includes("hypothalamus") ||
    lower.includes("brainstem") ||
    lower.includes("colliculus")
  ) {
    return "brainstem";
  }
  if (lower.includes("occipital")) return "occipital";
  if (
    lower.includes("temporal") ||
    lower.includes("insula") ||
    lower.includes("parahippocampal") ||
    lower.includes("fusiform") ||
    lower.includes("hippocampus") ||
    lower.includes("short gyrus")
  ) {
    return "temporal";
  }
  if (
    lower.includes("parietal") ||
    lower.includes("precuneus") ||
    lower.includes("postcentral") ||
    lower.includes("supramarginal") ||
    lower.includes("angular")
  ) {
    return "parietal";
  }
  if (
    lower.includes("frontal") ||
    lower.includes("orbital") ||
    lower.includes("cingulate") ||
    lower.includes("precentral")
  ) {
    return "frontal";
  }
  // Everything else in the brain is a deep structure: the corpus callosum,
  // the fornix, the white matter, the basal ganglia and the like.
  if (
    lower.includes("white matter") ||
    lower.includes("corpus callosum") ||
    lower.includes("septum") ||
    lower.includes("fornix") ||
    lower.includes("commissure") ||
    lower.includes("peduncle") ||
    lower.includes("thalamus") ||
    lower.includes("hypothalamus") ||
    lower.includes("nucleus") ||
    lower.includes("globus pallidus") ||
    lower.includes("putamen") ||
    lower.includes("amygdala") ||
    lower.includes("hippocampus") ||
    lower.includes("capsule") ||
    lower.includes("choroid plexus") ||
    lower.includes("cerebral hemisphere")
  ) {
    return "deep";
  }
  return null;
}

/** Which side of the midline a part belongs to, from its name. */
export function sideOf(name: string): "Left" | "Right" | "Midline" {
  const lower = name.toLowerCase();
  const left = lower.includes("left");
  const right = lower.includes("right");
  if (left && !right) return "Left";
  if (right && !left) return "Right";
  return "Midline";
}

/** Builds the region a click reports, from the part that was hit. */
export function regionOf(id: string, name: string): BrainRegion | null {
  const region = classifyPart(id, name);
  if (!region) return null;
  const label = REGION_LABELS[region];
  const side = sideOf(name);
  const display = side === "Midline" ? label : `${label} · ${side.toLowerCase()} hemisphere`;
  return { id: region, label, side, display, part: name };
}

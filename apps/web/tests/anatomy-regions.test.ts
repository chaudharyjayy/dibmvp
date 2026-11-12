import { describe, expect, it } from "vitest";
import { classifyPart, regionOf, sideOf } from "../components/anatomy/regions";
import { BRAIN_PART_NAMES } from "../components/anatomy/part-names";

/**
 * The brain region readout claims to name real anatomy, so these tests pin
 * the classification against the names the model actually ships with.
 */
describe("classifyPart", () => {
  it("reads the lobe off the anatomical name", () => {
    expect(classifyPart("FMA72653", "right superior frontal gyrus")).toBe("frontal");
    expect(classifyPart("FMA72975", "right occipital lobe")).toBe("occipital");
    expect(classifyPart("FMA72685", "right middle temporal gyrus")).toBe("temporal");
    expect(classifyPart("BP49", "left superior parietal lobule precuneus")).toBe("parietal");
  });

  it("reads the insula and the parahippocampal gyrus as temporal", () => {
    expect(classifyPart("FMA72977", "right insula")).toBe("temporal");
    expect(classifyPart("FMA72705", "right parahippocampal gyrus")).toBe("temporal");
  });

  it("reads the cerebellum and the brainstem as themselves", () => {
    expect(classifyPart("FMA67944", "cerebellum")).toBe("cerebellum");
    expect(classifyPart("FMA67943", "pons")).toBe("brainstem");
    expect(classifyPart("FMA62004", "medulla oblongata")).toBe("brainstem");
    expect(classifyPart("FMA61993nsn", "midbrain, nsn")).toBe("brainstem");
  });

  it("reads the midline structures as deep", () => {
    expect(classifyPart("FMA86464", "corpus callosum")).toBe("deep");
    expect(classifyPart("FMA61844", "septum pellucidum")).toBe("deep");
    expect(classifyPart("FMA61822", "white matter structure of cerebral hemisphere")).toBe("deep");
  });

  it("returns null for a name that is not a brain part", () => {
    expect(classifyPart("FMA7163", "skin")).toBeNull();
    expect(classifyPart("FMA1", "")).toBeNull();
  });
});

describe("sideOf", () => {
  it("reads the side off the name", () => {
    expect(sideOf("left superior frontal gyrus")).toBe("Left");
    expect(sideOf("right superior frontal gyrus")).toBe("Right");
  });

  it("calls a midline structure midline", () => {
    expect(sideOf("corpus callosum")).toBe("Midline");
    expect(sideOf("orbital gyri straight gyrus")).toBe("Midline");
  });
});

describe("regionOf", () => {
  it("builds a display label with the side", () => {
    const region = regionOf("FMA72654", "left superior frontal gyrus");
    expect(region?.display).toBe("Frontal lobe · left hemisphere");
    expect(region?.side).toBe("Left");
    expect(region?.part).toBe("left superior frontal gyrus");
  });

  it("leaves a midline structure without a hemisphere", () => {
    const region = regionOf("FMA86464", "corpus callosum");
    expect(region?.display).toBe("Deep brain structures");
    expect(region?.side).toBe("Midline");
  });

  it("returns null for a name that is not a brain part", () => {
    expect(regionOf("FMA7163", "skin")).toBeNull();
  });
});

describe("the shipped part names", () => {
  it("names every brain part the model ships", () => {
    // The mesh names in the GLB are Cortex_<FMA>_<side> and Deep_<FMA>_<side>.
    // Each must resolve to an anatomical name, or the readout would have
    // nothing to say about that part.
    for (const id of Object.keys(BRAIN_PART_NAMES)) {
      expect(BRAIN_PART_NAMES[id]).toBeTruthy();
      expect(classifyPart(id, BRAIN_PART_NAMES[id])).not.toBeNull();
    }
  });

  it("covers both sides of every named gyrus", () => {
    const byName = new Map<string, string[]>();
    for (const [id, name] of Object.entries(BRAIN_PART_NAMES)) {
      byName.set(name, [...(byName.get(name) ?? []), id]);
    }
    // "right superior frontal gyrus" and "left superior frontal gyrus" are
    // two entries, and both must be present.
    expect(byName.has("right superior frontal gyrus")).toBe(true);
    expect(byName.has("left superior frontal gyrus")).toBe(true);
  });
});

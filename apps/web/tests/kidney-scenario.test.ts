import { describe, expect, it } from "vitest";
import type { Drug, SimResult } from "@dib/engine";
import {
  CLEARANCE_SCENARIOS,
  compareRuns,
  SCENARIO_CONTEXT,
  scenarioById,
  withClearanceScenario,
} from "../lib/kidney-scenario";
import {
  KIDNEY_CONTEXT_LABEL,
  KIDNEY_PAPERS,
  kidneyPaperUrl,
} from "../lib/kidney-evidence";

/** A labelled test fixture, not real pharmacology. */
const fixtureDrug: Drug = {
  id: "fixture",
  name: "Test fixture",
  route: "oral",
  model: "one-compartment",
  ka_per_h: 1,
  F: 1,
  CL_L_per_h_per_kg: 0.5,
  V_L_per_kg: 1,
  studied_dose_range_mg: [10, 100],
  sources: [],
  notes: "TEST FIXTURE — placeholder numbers, not real drug data",
};

const engineResult = (overrides: Partial<SimResult> = {}): SimResult => ({
  tH: [],
  gutMg: [],
  bodyMg: [],
  concMgPerL: [],
  eliminationMgPerH: [],
  cmaxMgPerL: 2,
  tmaxH: 1,
  timeToClearH: 10,
  warnings: [],
  ...overrides,
});

describe("clearance scenarios", () => {
  it("offers a cited baseline and two synthetic reductions", () => {
    expect(CLEARANCE_SCENARIOS.map((s) => s.id)).toEqual([
      "baseline",
      "reduced",
      "further-reduced",
    ]);
    expect(CLEARANCE_SCENARIOS.map((s) => s.multiplier)).toEqual([1, 0.5, 0.25]);
  });

  it("falls back to the baseline for an unknown id", () => {
    expect(scenarioById("nope").id).toBe("baseline");
  });

  it("scales a copy of the drug's clearance without mutating the source", () => {
    const scaled = withClearanceScenario(fixtureDrug, "reduced");
    expect(scaled).not.toBe(fixtureDrug);
    expect(scaled.CL_L_per_h_per_kg).toBeCloseTo(0.25, 10);
    expect(fixtureDrug.CL_L_per_h_per_kg).toBe(0.5);
  });

  it("keeps the drug object on the baseline setting", () => {
    expect(withClearanceScenario(fixtureDrug, "baseline")).toBe(fixtureDrug);
  });

  it("cannot make a drug with an unsourced clearance runnable", () => {
    const unsourced: Drug = { ...fixtureDrug, CL_L_per_h_per_kg: null };
    expect(withClearanceScenario(unsourced, "further-reduced").CL_L_per_h_per_kg).toBeNull();
  });

  it("labels the setting as a model what-if, not a measurement", () => {
    expect(SCENARIO_CONTEXT).toMatch(/not a measurement of kidney function/i);
    expect(SCENARIO_CONTEXT).toMatch(/not dosing advice/i);
  });
});

describe("compareRuns", () => {
  it("builds every row from the two engine results", () => {
    const rows = compareRuns(
      engineResult({ cmaxMgPerL: 3, tmaxH: 2, timeToClearH: null }),
      engineResult({ cmaxMgPerL: 2, tmaxH: 1, timeToClearH: 10 })
    );
    expect(rows).toEqual([
      { label: "Peak level (Cmax)", baseline: "2.000 mg/L", scenario: "3.000 mg/L" },
      { label: "Time of peak (Tmax)", baseline: "1.00 h", scenario: "2.00 h" },
      {
        label: "Time below 5% of peak",
        baseline: "10.00 h",
        scenario: "Not within window",
      },
    ]);
  });
});

describe("kidney evidence", () => {
  it("holds hand-checked PubMed ids with a context label", () => {
    expect(KIDNEY_PAPERS.length).toBeGreaterThanOrEqual(3);
    for (const paper of KIDNEY_PAPERS) {
      expect(paper.pmid).toMatch(/^\d+$/);
      expect(paper.title.length).toBeGreaterThan(10);
      expect(paper.context.length).toBeGreaterThan(10);
    }
    expect(KIDNEY_CONTEXT_LABEL).toMatch(/not the model's output/i);
  });

  it("links to PubMed by stored id", () => {
    expect(kidneyPaperUrl("14606929")).toBe(
      "https://pubmed.ncbi.nlm.nih.gov/14606929/"
    );
  });
});

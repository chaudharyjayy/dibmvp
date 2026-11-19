/**
 * The kidney what-if: an illustrative multiplier on the model's total
 * clearance.
 *
 * This is a teaching control, not a clinical measurement. It does not read a
 * lab value, does not describe a disease, and does not suggest a dose. The
 * drug's cited clearance is never changed in the data layer: a scaled copy of
 * the engine's Drug is made for the scenario run, and the baseline run stays
 * available beside it.
 */

import type { Drug, SimResult } from "@dib/engine";

export const CLEARANCE_SCENARIO_IDS = ["baseline", "reduced", "further-reduced"] as const;
export type ClearanceScenarioId = (typeof CLEARANCE_SCENARIO_IDS)[number];

export type ClearanceScenario = {
  id: ClearanceScenarioId;
  label: string;
  multiplier: number;
  note: string;
};

export const CLEARANCE_SCENARIOS: readonly ClearanceScenario[] = [
  {
    id: "baseline",
    label: "Reference model — 100%",
    multiplier: 1,
    note: "The medicine runs on its cited clearance value, unchanged.",
  },
  {
    id: "reduced",
    label: "Illustrative lower clearance — 50%",
    multiplier: 0.5,
    note: "A what-if on the model's total clearance, not a measurement of any person.",
  },
  {
    id: "further-reduced",
    label: "Illustrative lower clearance — 25%",
    multiplier: 0.25,
    note: "A stronger what-if on the model's total clearance, not a measurement of any person.",
  },
];

/** The named setting, with a safe fallback for an unknown id. */
export function scenarioById(id: ClearanceScenarioId | string): ClearanceScenario {
  return CLEARANCE_SCENARIOS.find((s) => s.id === id) ?? CLEARANCE_SCENARIOS[0];
}

/**
 * A copy of the drug with its clearance scaled for the what-if run.
 * The source object is never mutated and a null clearance stays null, so a
 * drug without a sourced value cannot be made runnable by this control.
 */
export function withClearanceScenario(drug: Drug, id: ClearanceScenarioId | string): Drug {
  const scenario = scenarioById(id);
  if (scenario.multiplier === 1 || drug.CL_L_per_h_per_kg == null) return drug;
  return { ...drug, CL_L_per_h_per_kg: drug.CL_L_per_h_per_kg * scenario.multiplier };
}

/** Shown wherever the setting appears, in the panel and in saved summaries. */
export const SCENARIO_CONTEXT =
  "Illustrative model setting. It is not a measurement of kidney function, not a prediction for any person, and not dosing advice.";

export type ComparisonRow = { label: string; baseline: string; scenario: string };

const hours = (v: number) => `${v.toFixed(2)} h`;
const concentration = (v: number) => `${v.toFixed(3)} mg/L`;
const clearTime = (v: number | null) => (v == null ? "Not within window" : hours(v));

/**
 * A side-by-side built only from two engine results. No literature value and
 * no invented number is mixed into these rows.
 */
export function compareRuns(scenario: SimResult, baseline: SimResult): ComparisonRow[] {
  return [
    {
      label: "Peak level (Cmax)",
      baseline: concentration(baseline.cmaxMgPerL),
      scenario: concentration(scenario.cmaxMgPerL),
    },
    {
      label: "Time of peak (Tmax)",
      baseline: hours(baseline.tmaxH),
      scenario: hours(scenario.tmaxH),
    },
    {
      label: "Time below 5% of peak",
      baseline: clearTime(baseline.timeToClearH),
      scenario: clearTime(scenario.timeToClearH),
    },
  ];
}

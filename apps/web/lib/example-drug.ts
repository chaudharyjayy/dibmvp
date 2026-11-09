import type { Drug } from "@dib/engine";

/**
 * UI-ONLY example parameter set for exploring the simulator.
 * These are the SAME values as packages/engine's test fixture — synthetic,
 * NOT real pharmacology, and never written into data/drugs.json (which stays
 * null until real values are sourced from PK-DB / official labels).
 */
export const exampleDrug: Drug = {
  id: "example-pk-drug",
  name: "Example PK drug",
  route: "oral",
  model: "one-compartment",
  ka_per_h: 1.0,
  F: 1.0,
  V_L_per_kg: 5.0,
  CL_L_per_h_per_kg: 0.7,
  label_dose_range_mg: [0, 500],
  sources: [],
  notes: "TEST FIXTURE ONLY — placeholder parameters, not sourced",
};

export const EXAMPLE_BANNER =
  "Runs on placeholder test parameters (the engine's own test fixture). " +
  "Real drug parameters stay blank in the dataset until they are cited from PK-DB or an official label — nothing is invented here.";

/**
 * A treatment: one or more catalogue drugs, each simulated on its own
 * approved parameters, shown on the same axes — never summed, because
 * summing milligrams of different drugs is not a pharmacological quantity.
 *
 * What this file is and is not:
 *
 * - Each drug's curve comes from the engine, run on the drug's own
 *   approved `drug_pk` row — absorption, bioavailability, clearance and
 *   volume are that drug's cited values, scaled by body weight exactly as
 *   the engine documents.
 * - The panel and the walkthrough show each medicine's own curve and its
 *   own numbers. There is no combined pharmacological quantity, and every
 *   surface that shows the treatment says why: interactions are not
 *   modelled and are not being claimed.
 * - A drug with no approved PK row is not simulated at all. There is no
 *   fallback to invented numbers; the caller has to say the drug is not
 *   simulatable.
 */

import type { Drug, SimResult } from "@dib/engine";
import type { DrugPkRow } from "@dib/data-client";

/** One curve colour per medicine, in the order medicines are added. */
export const DRUG_COLORS = ["#38bdf8", "#f472b6", "#facc15", "#34d399", "#c084fc"] as const;

/** One medicine's own engine run, labelled for the panel and the report. */
export type MedicationRun = {
  id: string;
  name: string;
  color: string;
  result: SimResult;
};

/** The caption every multi-drug surface carries. */
export const SEPARATE_CURVES_CAPTION =
  "Each curve is modelled separately. Interactions are not modelled.";

export type CatalogueDrug = {
  id: string;
  name: string;
};

/**
 * The engine's Drug, built from an approved PK row. The sources array
 * carries the row's own provenance so a report can point at what the
 * numbers came from.
 */
export function drugFromPk(hit: CatalogueDrug, pk: DrugPkRow): Drug | null {
  if (
    pk.kaPerH == null ||
    pk.fBioavailability == null ||
    pk.clLPerHPerKg == null ||
    pk.vLPerKg == null
  ) {
    return null;
  }
  return {
    id: hit.id,
    name: hit.name,
    route: pk.route === "iv" ? "iv" : "oral",
    model: "one-compartment",
    ka_per_h: pk.kaPerH,
    F: pk.fBioavailability,
    CL_L_per_h_per_kg: pk.clLPerHPerKg,
    V_L_per_kg: pk.vLPerKg,
    studied_dose_range_mg:
      pk.doseMinMg != null && pk.doseMaxMg != null ? [pk.doseMinMg, pk.doseMaxMg] : null,
    sources: [pk.sourceUrl, pk.sourceTitle].filter((s): s is string => Boolean(s)),
    notes: "Parameters from the approved drug_pk row (cited).",
  };
}

/** How the panel names a drug's row in warnings, briefly. */
export function shortName(name: string): string {
  return name.length <= 28 ? name : `${name.slice(0, 27)}…`;
}

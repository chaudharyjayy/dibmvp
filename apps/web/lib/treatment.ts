/**
 * A treatment: one or more catalogue drugs, each simulated on its own
 * approved parameters, composed into one combined picture.
 *
 * What this file is and is not:
 *
 * - Each drug's curve comes from the engine, run on the drug's own
 *   approved `drug_pk` row — absorption, bioavailability, clearance and
 *   volume are that drug's cited values, scaled by body weight exactly as
 *   the engine documents.
 * - The combined panel is an ADDITIVE EXPOSURE model: each drug's
 *   concentration series is summed. That is a deliberate simplification,
 *   not pharmacology — the model does not simulate interactions,
 *   competition for enzymes, or displacement. Every label that shows a
 *   combined number says so.
 * - A drug with no approved PK row is not simulated at all. There is no
 *   fallback to invented numbers; the caller has to say the drug is not
 *   simulatable.
 */

import type { Drug, SimResult } from "@dib/engine";
import type { DrugPkRow } from "@dib/data-client";

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
    label_dose_range_mg:
      pk.doseMinMg != null && pk.doseMaxMg != null ? [pk.doseMinMg, pk.doseMaxMg] : null,
    sources: [pk.sourceUrl, pk.sourceTitle].filter((s): s is string => Boolean(s)),
    notes: "Parameters from the approved drug_pk row (cited).",
  };
}

/**
 * Additive composition of several one-drug results: amounts sum (gut,
 * body, elimination), concentrations sum. Nothing is renormalised —
 * whatever each drug's volume of distribution does, stays its own.
 */
export function composeTreatment(results: SimResult[]): SimResult | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const base = results[0];
  const n = base.tH.length;
  for (const r of results) {
    if (r.tH.length !== n) {
      throw new Error("composeTreatment: results must share one time grid");
    }
  }

  const sum = (pick: (r: SimResult, i: number) => number) =>
    Array.from({ length: n }, (_, i) => results.reduce((acc, r) => acc + pick(r, i), 0));

  const conc = sum((r, i) => r.concMgPerL[i]);
  let cmax = 0;
  let tmax = 0;
  conc.forEach((c, i) => {
    if (c > cmax) {
      cmax = c;
      tmax = base.tH[i];
    }
  });

  const elimination = sum((r, i) => r.eliminationMgPerH[i]);
  const timeToClearH = (() => {
    // Same heuristic the engine uses per drug: the first time after the
    // combined Tmax where the combined concentration stays under 5% of the
    // combined Cmax.
    const tmaxIdx = conc.indexOf(Math.max(...conc));
    const threshold = 0.05 * cmax;
    for (let i = tmaxIdx + 1; i < n; i++) {
      if (conc[i] < threshold) return base.tH[i];
    }
    return null;
  })();

  return {
    tH: base.tH,
    gutMg: sum((r, i) => r.gutMg[i]),
    bodyMg: sum((r, i) => r.bodyMg[i]),
    concMgPerL: conc,
    eliminationMgPerH: elimination,
    cmaxMgPerL: cmax,
    tmaxH: tmax,
    timeToClearH,
    warnings: results.flatMap((r) => r.warnings),
  };
}

/** How the panel names a drug's row in warnings, briefly. */
export function shortName(name: string): string {
  return name.length <= 28 ? name : `${name.slice(0, 27)}…`;
}

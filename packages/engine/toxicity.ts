/**
 * Synthetic toxicity and organ-failure assessment.
 *
 * This is a teaching model, not a clinical one. It does not compute a lethal
 * dose and it is not dosing advice. It answers one question the simulator
 * needs to be able to show: when a medicine is pushed far beyond the range its
 * parameters were sourced for, which organ in the *model* gives way first.
 *
 * The engine's PK is linear, so exposure scales with dose. The load below is
 * therefore expressed as a multiple of the studied dose ceiling, modified by
 * the selected organ archetypes' sensitivities and by any clearance change.
 * Nothing here reads a patient's lab value or predicts an outcome for a real
 * person.
 */

import type { SimInput, SimResult } from './types';
import {
  computeOrganAdjustments,
  getHeartProfile,
  getKidneyProfile,
  getLiverProfile,
  getLungProfile,
} from './organProfiles';

export type ToxicOrgan = 'heart' | 'lungs' | 'liver' | 'kidneys' | 'brain' | 'gut';

/** Organs whose failure stops the model on its own. The gut is not one. */
export const VITAL_ORGANS: readonly ToxicOrgan[] = ['heart', 'lungs', 'brain', 'liver'];

/** Relative reserve of each organ in the model (higher = more resilient). */
const RESERVE: Record<ToxicOrgan, number> = {
  heart: 1,
  lungs: 1.1,
  liver: 0.9,
  kidneys: 1.2,
  brain: 0.95,
  gut: 1.6,
};

/** A load at or above this means the organ has failed in the model. */
export const FAILURE_THRESHOLD = 2;

export type OrganFailure = {
  organ: ToxicOrgan;
  drugName: string;
  doseMg: number;
  timeH: number;
  load: number;
};

export type ToxicityResult = {
  /** Peak load per organ, as a multiple of its modelled tolerance. */
  organLoad: Record<ToxicOrgan, number>;
  /** Organs that crossed the failure threshold, in the order they failed. */
  failedOrgans: OrganFailure[];
  /** Set when a vital organ failed, or when enough organs failed. */
  death: OrganFailure | null;
  /** A plain-language cause of death, for the model's readout. */
  message: string | null;
};

const EMPTY_LOAD = (): Record<ToxicOrgan, number> => ({
  heart: 0,
  lungs: 0,
  liver: 0,
  kidneys: 0,
  brain: 0,
  gut: 0,
});

export function organLabel(organ: ToxicOrgan): string {
  const labels: Record<ToxicOrgan, string> = {
    heart: 'Heart',
    lungs: 'Lungs',
    liver: 'Liver',
    kidneys: 'Kidneys',
    brain: 'Brain',
    gut: 'Gut',
  };
  return labels[organ];
}

/**
 * Resolve the organ sensitivities carried by the selected archetypes. Missing
 * or unknown ids fall back to the healthy reference, so a partial selection
 * still produces a complete assessment.
 */
function sensitivities(input: SimInput): Record<ToxicOrgan, number> {
  const selected = input.profile.organProfiles;
  const heart = getHeartProfile(selected?.heartId);
  const kidney = getKidneyProfile(selected?.kidneyId);
  const liver = getLiverProfile(selected?.liverId);
  const lung = getLungProfile(selected?.lungId);
  return {
    heart: heart.cardiotoxic_sensitivity_multiplier,
    kidneys: kidney.nephrotoxic_sensitivity_multiplier,
    liver: liver.hepatotoxic_sensitivity_multiplier,
    lungs: lung.vq_mismatch_index,
    brain: 1,
    gut: 1,
  };
}

/**
 * Assess the run. Called at the end of `simulate`, so the UI's death state and
 * the curves always come from the same inputs.
 */
export function assessToxicity(input: SimInput, result: SimResult): ToxicityResult {
  const organLoad = EMPTY_LOAD();
  const sens = sensitivities(input);

  // A lower clearance means a higher exposure for the same dose. Organ-profile
  // adjustment and the what-if's drug-level scaling are both reflected here.
  const clearanceMultiplier =
    input.profile.organProfiles != null
      ? computeOrganAdjustments(input.profile.organProfiles).clearanceMultiplier
      : 1;
  const exposureFactor = Number.isFinite(clearanceMultiplier) && clearanceMultiplier > 0
    ? 1 / clearanceMultiplier
    : 1;

  const studiedMax = input.drug.studied_dose_range_mg?.[1] ?? null;
  // A drug with no sourced ceiling is still assessable: 100 mg is a neutral
  // reference, and the UI already labels such a run as unsourced.
  const referenceMax = studiedMax != null && studiedMax > 0 ? studiedMax : 100;

  const failedOrgans: OrganFailure[] = [];
  const failed = new Set<ToxicOrgan>();

  const doses = [...input.doses].sort((a, b) => a.timeH - b.timeH);
  for (const dose of doses) {
    const overload = Math.max(0, dose.doseMg) / referenceMax;
    for (const organ of Object.keys(organLoad) as ToxicOrgan[]) {
      const perDose = (overload * exposureFactor * sens[organ]) / RESERVE[organ];
      organLoad[organ] += perDose;
      if (!failed.has(organ) && organLoad[organ] >= FAILURE_THRESHOLD) {
        failed.add(organ);
        failedOrgans.push({
          organ,
          drugName: input.drug.name,
          doseMg: dose.doseMg,
          timeH: dose.timeH,
          load: Number(organLoad[organ].toFixed(2)),
        });
      }
    }
  }

  for (const value of Object.keys(organLoad) as ToxicOrgan[]) {
    organLoad[value] = Number(organLoad[value].toFixed(3));
  }

  // The first failure that is vital, or the second failure of any kind, kills
  // the model. The earlier of the two is the one shown in the readout.
  let death: OrganFailure | null = null;
  const vitalFailure = failedOrgans.find((f) => VITAL_ORGANS.includes(f.organ));
  if (vitalFailure) {
    death = vitalFailure;
  } else if (failedOrgans.length >= 2) {
    death = failedOrgans[1];
  }

  const message = death
    ? `${organLabel(death.organ)} failure after ${death.drugName} ${death.doseMg} mg at ${death.timeH.toFixed(1)} h — the model died.`
    : null;

  return { organLoad, failedOrgans, death, message };
}

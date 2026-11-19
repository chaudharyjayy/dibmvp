import type { HeartProfile, KidneyProfile, LiverProfile, LungProfile, OrganSimulationSignals } from './organTypes';
import type { SimResult, Drug } from './types';

/**
 * Per-timepoint organ physiology driven by the simulated exposure.
 *
 * Inputs are the engine's own curves (concentration and elimination) and the
 * selected archetypes' sensitivities. This is a qualitative response shaped by
 * dataset multipliers — it is not a mechanistic pharmacodynamic model, and the
 * UI says so wherever it shows these numbers.
 */
export function computeOrganDynamics(
  result: SimResult,
  drug: Drug,
  organs: {
    heart: HeartProfile;
    liver: LiverProfile;
    kidney: KidneyProfile;
    lung: LungProfile;
  }
): OrganSimulationSignals {
  const { heart, liver, kidney, lung } = organs;
  const n = result.tH.length;
  const cmax = Math.max(result.cmaxMgPerL, 1e-6);

  const heartRateBpm: number[] = new Array(n);
  const ejectionFractionPct: number[] = new Array(n);
  const qtIntervalMs: number[] = new Array(n);
  const cardiacOutputLMin: number[] = new Array(n);

  const altUL: number[] = new Array(n);
  const effectiveClearanceRateLPerH: number[] = new Array(n);
  const hepaticExposureScore: number[] = new Array(n);

  const egfrMlMin: number[] = new Array(n);
  const serumCreatinineMgDl: number[] = new Array(n);
  const renalEliminationRateMgPerH: number[] = new Array(n);

  const spo2Pct: number[] = new Array(n);
  const respiratoryRateBpm: number[] = new Array(n);
  const airwayResistanceIndex: number[] = new Array(n);

  // Drug-specific traits, matched on the catalogue id.
  const id = drug.id.toLowerCase();
  const isCaffeine = id.includes('caffeine');
  const isParacetamol = id.includes('paracetamol') || id.includes('acetaminophen');
  const isNsaid = id.includes('ibuprofen') || id.includes('nsaid');

  let cumulativeHepaticDose = 0;

  for (let i = 0; i < n; i++) {
    const conc = result.concMgPerL[i];
    const elim = result.eliminationMgPerH[i];
    const relConc = Math.min(conc / cmax, 2.5);

    const dt = i > 0 ? result.tH[i] - result.tH[i - 1] : 0.05;
    cumulativeHepaticDose += elim * dt;

    // ---- heart ----------------------------------------------------------
    const stimulant = isCaffeine ? 1.0 : 0.25;
    heartRateBpm[i] = Math.round(
      heart.resting_heart_rate_bpm + 22 * stimulant * relConc * heart.conduction_sensitivity_multiplier
    );

    const efDelta =
      (isCaffeine ? 3 * relConc : -2 * relConc * heart.cardiotoxic_sensitivity_multiplier) *
      heart.contractility_multiplier;
    ejectionFractionPct[i] = Math.max(10, Math.min(85, Math.round(heart.lvef_pct + efDelta)));

    qtIntervalMs[i] = Math.round(
      heart.baseline_qt_interval_ms + 35 * relConc * heart.conduction_sensitivity_multiplier
    );

    const coScale = (ejectionFractionPct[i] / 60) * (heartRateBpm[i] / 70);
    cardiacOutputLMin[i] = Number((heart.cardiac_output_l_min * Math.min(coScale, 1.8)).toFixed(2));

    // ---- liver ----------------------------------------------------------
    const altDamage = isParacetamol ? 2.5 : 0.5;
    altUL[i] = Math.round(
      liver.alt_u_l + cumulativeHepaticDose * 0.15 * liver.hepatotoxic_sensitivity_multiplier * altDamage
    );

    effectiveClearanceRateLPerH[i] = Number(
      (
        (drug.CL_L_per_h_per_kg ?? 0.3) *
        liver.clearance_scaling_factor *
        liver.cyp450_activity_multiplier
      ).toFixed(3)
    );

    hepaticExposureScore[i] = Math.min(100, Math.round(relConc * 50 * liver.hepatotoxic_sensitivity_multiplier));

    // ---- kidney ---------------------------------------------------------
    const nephro = isNsaid ? 2.0 : 0.4;
    const currentEgfr = Math.max(
      5,
      kidney.egfr_ml_min_1_73m2 - 15 * relConc * kidney.nephrotoxic_sensitivity_multiplier * nephro
    );
    egfrMlMin[i] = Math.round(currentEgfr);

    const creatRise = (1 - currentEgfr / kidney.egfr_ml_min_1_73m2) * kidney.serum_creatinine_mg_dl * 0.6;
    serumCreatinineMgDl[i] = Number((kidney.serum_creatinine_mg_dl + creatRise).toFixed(2));

    renalEliminationRateMgPerH[i] = Number((elim * 0.5 * kidney.clearance_scaling_factor).toFixed(2));

    // ---- lung -----------------------------------------------------------
    airwayResistanceIndex[i] = Number(
      (lung.airway_resistance_multiplier + 0.4 * relConc * lung.airway_resistance_multiplier).toFixed(2)
    );

    respiratoryRateBpm[i] = Math.round(
      lung.respiratory_rate_bpm + (isCaffeine ? 4 : 1.5) * relConc * lung.respiratory_drive_sensitivity
    );

    const spo2Drop = (lung.vq_mismatch_index * 8 * relConc) / Math.max(0.5, lung.respiratory_drive_sensitivity);
    spo2Pct[i] = Number(Math.max(70, Math.min(100, lung.spo2_rest_pct - spo2Drop)).toFixed(1));
  }

  return {
    heartRateBpm,
    ejectionFractionPct,
    qtIntervalMs,
    cardiacOutputLMin,
    altUL,
    effectiveClearanceRateLPerH,
    hepaticExposureScore,
    egfrMlMin,
    serumCreatinineMgDl,
    renalEliminationRateMgPerH,
    spo2Pct,
    respiratoryRateBpm,
    airwayResistanceIndex,
  };
}

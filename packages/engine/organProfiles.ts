import {
  HEART_PROFILES,
  KIDNEY_PROFILES,
  LIVER_PROFILES,
  LUNG_PROFILES,
} from "./organProfilesData";
import type {
  HeartProfile,
  HeartProfileId,
  KidneyProfile,
  KidneyProfileId,
  LiverProfile,
  LiverProfileId,
  LungProfile,
  LungProfileId,
  OrganProfileSelection,
} from "./organProfilesTypes";

export * from "./organProfilesTypes";
export { HEART_PROFILES, KIDNEY_PROFILES, LIVER_PROFILES, LUNG_PROFILES };

export function getHeartProfile(id?: string | null): HeartProfile {
  return (
    HEART_PROFILES.find((p) => p.profile_id === id) ?? HEART_PROFILES[0]
  );
}

export function getKidneyProfile(id?: string | null): KidneyProfile {
  return (
    KIDNEY_PROFILES.find((p) => p.profile_id === id) ?? KIDNEY_PROFILES[0]
  );
}

export function getLiverProfile(id?: string | null): LiverProfile {
  return (
    LIVER_PROFILES.find((p) => p.profile_id === id) ?? LIVER_PROFILES[0]
  );
}

export function getLungProfile(id?: string | null): LungProfile {
  return (
    LUNG_PROFILES.find((p) => p.profile_id === id) ?? LUNG_PROFILES[0]
  );
}

export function getDefaultOrganProfiles(): Required<OrganProfileSelection> {
  return {
    heartId: "heart_healthy_adult",
    kidneyId: "kidney_healthy_adult",
    liverId: "liver_healthy_adult",
    lungId: "lung_healthy_adult",
  };
}

/**
 * Maps a simulator condition to default organ profiles.
 */
export function getOrganProfilesForCondition(conditionId: string): Required<OrganProfileSelection> {
  switch (conditionId) {
    case "hypertension":
      return {
        heartId: "heart_hypertensive_lvh",
        kidneyId: "kidney_ckd_stage2_diabetic",
        liverId: "liver_healthy_adult",
        lungId: "lung_healthy_adult",
      };
    case "kidney":
      return {
        heartId: "heart_healthy_adult",
        kidneyId: "kidney_ckd_stage3_hypertensive",
        liverId: "liver_healthy_adult",
        lungId: "lung_healthy_adult",
      };
    case "liver":
      return {
        heartId: "heart_healthy_adult",
        kidneyId: "kidney_healthy_adult",
        liverId: "liver_compensated_cirrhosis_childA",
        lungId: "lung_healthy_adult",
      };
    case "asthma":
      return {
        heartId: "heart_healthy_adult",
        kidneyId: "kidney_healthy_adult",
        liverId: "liver_healthy_adult",
        lungId: "lung_uncontrolled_asthma",
      };
    case "infection":
      return {
        heartId: "heart_healthy_adult",
        kidneyId: "kidney_healthy_adult",
        liverId: "liver_healthy_adult",
        lungId: "lung_mild_copd_smoker",
      };
    case "cardiovascular":
      return {
        heartId: "heart_mild_hfref",
        kidneyId: "kidney_ckd_stage2_diabetic",
        liverId: "liver_healthy_adult",
        lungId: "lung_healthy_adult",
      };
    case "respiratory":
      return {
        heartId: "heart_healthy_adult",
        kidneyId: "kidney_healthy_adult",
        liverId: "liver_healthy_adult",
        lungId: "lung_moderate_copd_smoker",
      };
    default:
      return getDefaultOrganProfiles();
  }
}

/**
 * Calculates systemic clearance and bioavailability multipliers from organ profiles.
 * For general one-compartment models without route-specific clearance metadata,
 * hepatic and renal clearances are modelled as each contributing roughly 50% of systemic clearance.
 */
export function computeOrganAdjustments(selection?: OrganProfileSelection) {
  const liver = getLiverProfile(selection?.liverId);
  const kidney = getKidneyProfile(selection?.kidneyId);

  // Clearance is shared between hepatic metabolism and renal excretion (50/50 baseline assumption)
  const hepaticFactor = liver.clearance_scaling_factor;
  const renalFactor = kidney.clearance_scaling_factor;
  const clearanceMultiplier = 0.5 * hepaticFactor + 0.5 * renalFactor;

  // First-pass hepatic extraction affects oral bioavailability
  const bioavailabilityMultiplier = liver.first_pass_bioavailability_multiplier;

  return {
    clearanceMultiplier,
    bioavailabilityMultiplier,
    hepaticFactor,
    renalFactor,
  };
}

/**
 * Dynamic response calculations for organs responding to drug concentration and clearance.
 * Uses physiological sensitivity multipliers from the dataset archetypes.
 */

export function computeHeartDynamic(
  profile: HeartProfile,
  concMgPerL: number,
  peakConc: number
) {
  const norm = peakConc > 1e-9 ? Math.max(0, Math.min(1.5, concMgPerL / peakConc)) : 0;
  const sensConduction = profile.conduction_sensitivity_multiplier;
  const sensTox = profile.cardiotoxic_sensitivity_multiplier;

  // Heart rate response (e.g. chronotropic stimulation / compensatory reflex)
  const deltaHr = Math.round(norm * 18 * sensConduction);
  const currentHr = profile.resting_heart_rate_bpm + deltaHr;

  // QT prolongation
  const deltaQt = Math.round(norm * 35 * sensConduction);
  const currentQt = profile.baseline_qt_interval_ms + deltaQt;

  // Ejection fraction depression under cardiotoxic strain
  const deltaLvef = -Math.round(norm * 6 * sensTox);
  const currentLvef = Math.max(15, profile.lvef_pct + deltaLvef);

  // Cardiac output tracks stroke volume & rate
  const coScale = (currentHr / profile.resting_heart_rate_bpm) * (currentLvef / profile.lvef_pct);
  const currentCo = Number((profile.cardiac_output_l_min * coScale).toFixed(2));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, norm * 0.7 + (deltaQt / 80) * 0.3);

  return {
    currentHr,
    deltaHr,
    currentQt,
    deltaQt,
    currentLvef,
    deltaLvef,
    currentCo,
    stress,
  };
}

export function computeKidneyDynamic(
  profile: KidneyProfile,
  concMgPerL: number,
  peakConc: number
) {
  const norm = peakConc > 1e-9 ? Math.max(0, Math.min(1.5, concMgPerL / peakConc)) : 0;
  const sensTox = profile.nephrotoxic_sensitivity_multiplier;

  // eGFR transient decrease during peak drug concentration
  const maxDrop = Math.min(profile.egfr_ml_min_1_73m2 * 0.25, 20);
  const deltaEgfr = -Number((norm * maxDrop * (sensTox / 1.5)).toFixed(1));
  const currentEgfr = Math.max(5, Number((profile.egfr_ml_min_1_73m2 + deltaEgfr).toFixed(1)));

  // Serum creatinine rises inversely to eGFR filtration changes
  const crRatio = profile.egfr_ml_min_1_73m2 / currentEgfr;
  const currentCr = Number((profile.serum_creatinine_mg_dl * crRatio).toFixed(2));
  const deltaCr = Number((currentCr - profile.serum_creatinine_mg_dl).toFixed(2));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, norm * (sensTox / 2.0));

  return {
    currentEgfr,
    deltaEgfr,
    currentCr,
    deltaCr,
    stress,
  };
}

export function computeLiverDynamic(
  profile: LiverProfile,
  elimMgPerH: number,
  peakElim: number
) {
  const norm = peakElim > 1e-9 ? Math.max(0, Math.min(1.5, elimMgPerH / peakElim)) : 0;
  const sensTox = profile.hepatotoxic_sensitivity_multiplier;

  // ALT / AST transient enzyme release under active clearance workload
  const deltaAlt = Math.round(norm * 35 * sensTox);
  const currentAlt = profile.alt_u_l + deltaAlt;

  const deltaAst = Math.round(norm * 25 * sensTox);
  const currentAst = profile.ast_u_l + deltaAst;

  // Metabolic workload relative to functional CYP capacity
  const cypCapacity = Math.max(0.15, profile.cyp450_activity_multiplier);
  const workloadPct = Math.min(100, Math.round((norm / cypCapacity) * 80));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, (workloadPct / 100) * 0.7 + (norm * sensTox * 0.3));

  return {
    currentAlt,
    deltaAlt,
    currentAst,
    deltaAst,
    workloadPct,
    stress,
  };
}

export function computeLungDynamic(
  profile: LungProfile,
  concMgPerL: number,
  peakConc: number
) {
  const norm = peakConc > 1e-9 ? Math.max(0, Math.min(1.5, concMgPerL / peakConc)) : 0;
  const airwayResist = profile.airway_resistance_multiplier;
  const driveSens = profile.respiratory_drive_sensitivity;

  // SpO2 dip under systemic drug exposure, accentuated in high airway resistance / V/Q mismatch
  const maxDrop = 3 * airwayResist * (1 / driveSens);
  const deltaSpo2 = -Math.round(norm * maxDrop);
  const currentSpo2 = Math.max(75, profile.spo2_rest_pct + deltaSpo2);

  // Compensatory respiratory rate modulation
  const deltaRr = Math.round(norm * 4 * driveSens);
  const currentRr = profile.respiratory_rate_bpm + deltaRr;

  // Dynamic airway resistance under drug effect
  const currentAirwayResist = Number((airwayResist * (1 + norm * 0.25)).toFixed(2));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, norm * 0.6 + (Math.abs(deltaSpo2) / 6) * 0.4);

  return {
    currentSpo2,
    deltaSpo2,
    currentRr,
    deltaRr,
    currentAirwayResist,
    stress,
  };
}


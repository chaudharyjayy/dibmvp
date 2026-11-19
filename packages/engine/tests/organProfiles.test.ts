import { describe, expect, it } from "vitest";
import {
  HEART_PROFILES,
  KIDNEY_PROFILES,
  LIVER_PROFILES,
  LUNG_PROFILES,
  getHeartProfile,
  getKidneyProfile,
  getLiverProfile,
  getLungProfile,
  getOrganProfilesForCondition,
  computeOrganAdjustments,
  computeHeartDynamic,
  computeKidneyDynamic,
  computeLiverDynamic,
  computeLungDynamic,
  simulate,
} from "../index";

describe("organ profiles dataset integration", () => {
  it("loads 6 profiles for each organ dataset", () => {
    expect(HEART_PROFILES.length).toBe(6);
    expect(KIDNEY_PROFILES.length).toBe(6);
    expect(LIVER_PROFILES.length).toBe(6);
    expect(LUNG_PROFILES.length).toBe(6);
  });

  it("retrieves healthy adult baseline defaults when given invalid or missing id", () => {
    const heart = getHeartProfile("unknown_id");
    expect(heart.profile_id).toBe("heart_healthy_adult");
    expect(heart.lvef_pct).toBe(62);
    expect(heart.resting_heart_rate_bpm).toBe(70);

    const kidney = getKidneyProfile();
    expect(kidney.profile_id).toBe("kidney_healthy_adult");
    expect(kidney.egfr_ml_min_1_73m2).toBe(100);

    const liver = getLiverProfile();
    expect(liver.profile_id).toBe("liver_healthy_adult");
    expect(liver.clearance_scaling_factor).toBe(1.0);

    const lung = getLungProfile();
    expect(lung.profile_id).toBe("lung_healthy_adult");
    expect(lung.fev1_pct_predicted).toBe(100);
  });

  it("maps conditions to appropriate organ archetypes", () => {
    const hyper = getOrganProfilesForCondition("hypertension");
    expect(hyper.heartId).toBe("heart_hypertensive_lvh");

    const renal = getOrganProfilesForCondition("kidney");
    expect(renal.kidneyId).toBe("kidney_ckd_stage3_hypertensive");

    const hepatic = getOrganProfilesForCondition("liver");
    expect(hepatic.liverId).toBe("liver_compensated_cirrhosis_childA");

    const pulm = getOrganProfilesForCondition("asthma");
    expect(pulm.lungId).toBe("lung_uncontrolled_asthma");
  });

  it("computes organ clearance adjustments accurately", () => {
    const healthyAdj = computeOrganAdjustments();
    expect(healthyAdj.clearanceMultiplier).toBe(1.0);

    // Child-Pugh C (clearance_scaling_factor: 0.15) + CKD Stage 5 (clearance_scaling_factor: 0.1)
    const severeAdj = computeOrganAdjustments({
      liverId: "liver_decompensated_cirrhosis_childC",
      kidneyId: "kidney_ckd_stage5_failure",
    });
    // 0.5 * 0.15 + 0.5 * 0.1 = 0.075 + 0.05 = 0.125
    expect(severeAdj.clearanceMultiplier).toBeCloseTo(0.125);
  });

  it("adjusts simulated drug elimination when organ impairment profiles are provided", () => {
    const baseDrug = {
      id: "mock-drug",
      name: "Mock Drug",
      route: "oral" as const,
      model: "one-compartment" as const,
      ka_per_h: 1.2,
      F: 0.85,
      CL_L_per_h_per_kg: 0.5,
      V_L_per_kg: 1.0,
      studied_dose_range_mg: [100, 500] as [number, number],
      sources: ["Mock"],
      notes: "Mock",
    };

    const healthyResult = simulate({
      profile: { ageYears: 40, weightKg: 70, sex: "M" },
      drug: baseDrug,
      doses: [{ drugId: "mock-drug", doseMg: 200, timeH: 0 }],
      tEndH: 24,
    });

    const impairedResult = simulate({
      profile: {
        ageYears: 40,
        weightKg: 70,
        sex: "M",
        organProfiles: {
          kidneyId: "kidney_ckd_stage4_diabetic_hypertensive",
        },
      },
      drug: baseDrug,
      doses: [{ drugId: "mock-drug", doseMg: 200, timeH: 0 }],
      tEndH: 24,
    });

    // Impaired clearance means drug stays in circulation longer, so conc at 24h is higher
    const conc24Healthy = healthyResult.concMgPerL[healthyResult.concMgPerL.length - 1];
    const conc24Impaired = impairedResult.concMgPerL[impairedResult.concMgPerL.length - 1];
    expect(conc24Impaired).toBeGreaterThan(conc24Healthy);
    expect(impairedResult.warnings.length).toBeGreaterThan(0);
  });

  it("calculates dynamic organ responses based on drug concentration and sensitivity", () => {
    const heart = getHeartProfile("heart_healthy_adult");
    const hDyn = computeHeartDynamic(heart, 10, 10);
    expect(hDyn.deltaHr).toBeGreaterThan(0);
    expect(hDyn.currentHr).toBe(heart.resting_heart_rate_bpm + hDyn.deltaHr);
    expect(hDyn.deltaQt).toBeGreaterThan(0);

    const kidney = getKidneyProfile("kidney_ckd_stage4_diabetic_hypertensive");
    const kDyn = computeKidneyDynamic(kidney, 10, 10);
    expect(kDyn.deltaEgfr).toBeLessThan(0);
    expect(kDyn.deltaCr).toBeGreaterThan(0);

    const liver = getLiverProfile("liver_compensated_cirrhosis_childA");
    const lDyn = computeLiverDynamic(liver, 5, 5);
    expect(lDyn.deltaAlt).toBeGreaterThan(0);
    expect(lDyn.workloadPct).toBeGreaterThan(0);

    const lung = getLungProfile("lung_severe_copd_emphysema");
    const luDyn = computeLungDynamic(lung, 10, 10);
    expect(luDyn.deltaSpo2).toBeLessThan(0);
  });
});


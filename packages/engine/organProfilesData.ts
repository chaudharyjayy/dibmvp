// Auto-generated from data/organ-profiles datasets
import type { HeartProfile, KidneyProfile, LiverProfile, LungProfile } from "./organProfilesTypes";

export const HEART_PROFILES: HeartProfile[] = [
  {
    "profile_id": "heart_healthy_adult",
    "label": "Healthy adult heart",
    "conditions": [],
    "nyha_class": "none",
    "lvef_pct": 62,
    "resting_heart_rate_bpm": 70,
    "cardiac_output_l_min": 5.5,
    "mean_arterial_pressure_mmhg": 90,
    "baseline_qt_interval_ms": 400,
    "contractility_multiplier": 1.0,
    "conduction_sensitivity_multiplier": 1.0,
    "cardiotoxic_sensitivity_multiplier": 1.0,
    "basis": "Standard healthy-adult reference ranges for LVEF, resting heart rate, cardiac output and QT interval"
  },
  {
    "profile_id": "heart_hypertensive_lvh",
    "label": "Hypertension with left ventricular hypertrophy, preserved ejection fraction",
    "conditions": [
      "Chronic hypertension",
      "Left ventricular hypertrophy"
    ],
    "nyha_class": "I",
    "lvef_pct": 60,
    "resting_heart_rate_bpm": 75,
    "cardiac_output_l_min": 5.2,
    "mean_arterial_pressure_mmhg": 112,
    "baseline_qt_interval_ms": 410,
    "contractility_multiplier": 1.0,
    "conduction_sensitivity_multiplier": 1.1,
    "cardiotoxic_sensitivity_multiplier": 1.2,
    "basis": "NYHA class I means structural heart disease with no symptom limitation; ejection fraction is preserved despite the thickened muscle, which is the defining feature of this stage"
  },
  {
    "profile_id": "heart_mild_hfref",
    "label": "Mild heart failure with reduced ejection fraction (HFrEF), NYHA II",
    "conditions": [
      "Heart failure with reduced ejection fraction"
    ],
    "nyha_class": "II",
    "lvef_pct": 40,
    "resting_heart_rate_bpm": 80,
    "cardiac_output_l_min": 4.2,
    "mean_arterial_pressure_mmhg": 85,
    "baseline_qt_interval_ms": 430,
    "contractility_multiplier": 0.75,
    "conduction_sensitivity_multiplier": 1.3,
    "cardiotoxic_sensitivity_multiplier": 1.8,
    "basis": "NYHA II is mild symptoms with ordinary activity; LVEF < 40% defines HFrEF"
  },
  {
    "profile_id": "heart_moderate_hfref",
    "label": "Moderate heart failure with reduced ejection fraction, NYHA III",
    "conditions": [
      "Heart failure with reduced ejection fraction"
    ],
    "nyha_class": "III",
    "lvef_pct": 28,
    "resting_heart_rate_bpm": 90,
    "cardiac_output_l_min": 3.2,
    "mean_arterial_pressure_mmhg": 80,
    "baseline_qt_interval_ms": 450,
    "contractility_multiplier": 0.55,
    "conduction_sensitivity_multiplier": 1.6,
    "cardiotoxic_sensitivity_multiplier": 2.5,
    "basis": "NYHA III is marked symptom limitation with less-than-ordinary activity; falling cardiac output and a longer baseline QT reflect the more compromised muscle"
  },
  {
    "profile_id": "heart_severe_hfref_post_mi",
    "label": "Severe heart failure post-myocardial infarction, NYHA IV",
    "conditions": [
      "Prior myocardial infarction",
      "Heart failure with reduced ejection fraction"
    ],
    "nyha_class": "IV",
    "lvef_pct": 20,
    "resting_heart_rate_bpm": 100,
    "cardiac_output_l_min": 2.5,
    "mean_arterial_pressure_mmhg": 75,
    "baseline_qt_interval_ms": 470,
    "contractility_multiplier": 0.35,
    "conduction_sensitivity_multiplier": 2.0,
    "cardiotoxic_sensitivity_multiplier": 3.2,
    "basis": "NYHA IV is symptoms at rest; a prior infarction leaves a region of dead, non-contracting muscle (scar), which is why contractility drops sharply and arrhythmia risk from drugs rises further"
  },
  {
    "profile_id": "heart_atrial_fibrillation",
    "label": "Atrial fibrillation, otherwise preserved pump function",
    "conditions": [
      "Chronic atrial fibrillation"
    ],
    "nyha_class": "I",
    "lvef_pct": 55,
    "resting_heart_rate_bpm": 95,
    "cardiac_output_l_min": 5.0,
    "mean_arterial_pressure_mmhg": 88,
    "baseline_qt_interval_ms": 415,
    "contractility_multiplier": 0.95,
    "conduction_sensitivity_multiplier": 2.2,
    "cardiotoxic_sensitivity_multiplier": 1.3,
    "basis": "Atrial fibrillation is primarily a rhythm disorder rather than a pump-strength problem, so LVEF and contractility stay closer to normal while conduction sensitivity is set high to reflect the existing electrical instability"
  }
];

export const KIDNEY_PROFILES: KidneyProfile[] = [
  {
    "profile_id": "kidney_healthy_adult",
    "label": "Healthy adult",
    "comorbidities": [],
    "egfr_ml_min_1_73m2": 100,
    "ckd_stage": "G1 (normal)",
    "serum_creatinine_mg_dl": 0.9,
    "bun_mg_dl": 14,
    "urine_acr_mg_g": 10,
    "mean_arterial_pressure_mmhg": 90,
    "nephrotoxic_sensitivity_multiplier": 1.0,
    "clearance_scaling_factor": 1.0,
    "basis": "Standard healthy-adult reference ranges for eGFR, creatinine and BUN"
  },
  {
    "profile_id": "kidney_ckd_stage2_diabetic",
    "label": "Mild CKD, early diabetic nephropathy",
    "comorbidities": [
      "Type 2 diabetes"
    ],
    "egfr_ml_min_1_73m2": 75,
    "ckd_stage": "G2 (mildly decreased)",
    "serum_creatinine_mg_dl": 1.1,
    "bun_mg_dl": 18,
    "urine_acr_mg_g": 80,
    "mean_arterial_pressure_mmhg": 95,
    "nephrotoxic_sensitivity_multiplier": 1.3,
    "clearance_scaling_factor": 0.8,
    "basis": "KDIGO stage G2 is eGFR 60-89; elevated urine ACR (>30 mg/g) is the classic early sign of diabetic kidney damage even before eGFR drops much"
  },
  {
    "profile_id": "kidney_ckd_stage3_hypertensive",
    "label": "Moderate CKD, hypertensive nephrosclerosis",
    "comorbidities": [
      "Hypertension",
      "Nephrosclerosis"
    ],
    "egfr_ml_min_1_73m2": 45,
    "ckd_stage": "G3b (moderately to severely decreased)",
    "serum_creatinine_mg_dl": 1.8,
    "bun_mg_dl": 28,
    "urine_acr_mg_g": 150,
    "mean_arterial_pressure_mmhg": 110,
    "nephrotoxic_sensitivity_multiplier": 1.8,
    "clearance_scaling_factor": 0.5,
    "basis": "KDIGO stage G3b is eGFR 30-44; long-standing high blood pressure damaging the small kidney vessels is a leading cause of CKD at this stage"
  },
  {
    "profile_id": "kidney_ckd_stage4_diabetic_hypertensive",
    "label": "Severe CKD, combined diabetic and hypertensive damage",
    "comorbidities": [
      "Type 2 diabetes",
      "Hypertension"
    ],
    "egfr_ml_min_1_73m2": 25,
    "ckd_stage": "G4 (severely decreased)",
    "serum_creatinine_mg_dl": 3.0,
    "bun_mg_dl": 45,
    "urine_acr_mg_g": 400,
    "mean_arterial_pressure_mmhg": 115,
    "nephrotoxic_sensitivity_multiplier": 2.5,
    "clearance_scaling_factor": 0.3,
    "basis": "KDIGO stage G4 is eGFR 15-29; combined diabetes and hypertension is a common real-world pattern at this severity"
  },
  {
    "profile_id": "kidney_aki_recovery",
    "label": "Recovering from acute kidney injury",
    "comorbidities": [
      "Recent acute kidney injury (resolving)"
    ],
    "egfr_ml_min_1_73m2": 55,
    "ckd_stage": "G3a (mildly to moderately decreased, improving)",
    "serum_creatinine_mg_dl": 1.5,
    "bun_mg_dl": 22,
    "urine_acr_mg_g": 50,
    "mean_arterial_pressure_mmhg": 88,
    "nephrotoxic_sensitivity_multiplier": 2.0,
    "clearance_scaling_factor": 0.6,
    "basis": "A kidney recovering from a recent acute injury is disproportionately sensitive to a second nephrotoxic hit even though its resting eGFR looks only moderately reduced; this profile exists to demo that extra fragility"
  },
  {
    "profile_id": "kidney_ckd_stage5_failure",
    "label": "Kidney failure",
    "comorbidities": [
      "End-stage kidney disease"
    ],
    "egfr_ml_min_1_73m2": 10,
    "ckd_stage": "G5 (kidney failure)",
    "serum_creatinine_mg_dl": 6.5,
    "bun_mg_dl": 80,
    "urine_acr_mg_g": 800,
    "mean_arterial_pressure_mmhg": 100,
    "nephrotoxic_sensitivity_multiplier": 3.0,
    "clearance_scaling_factor": 0.1,
    "basis": "KDIGO stage G5 is eGFR < 15; kidney-cleared drugs accumulate heavily and often need dose adjustment or dialysis timing in real care"
  }
];

export const LIVER_PROFILES: LiverProfile[] = [
  {
    "profile_id": "liver_healthy_adult",
    "label": "Healthy adult liver",
    "cause": [],
    "child_pugh_class": "none",
    "child_pugh_score": null,
    "alt_u_l": 25,
    "ast_u_l": 25,
    "total_bilirubin_mg_dl": 0.8,
    "albumin_g_dl": 4.3,
    "inr": 1.0,
    "hepatic_blood_flow_multiplier": 1.0,
    "cyp450_activity_multiplier": 1.0,
    "first_pass_bioavailability_multiplier": 1.0,
    "clearance_scaling_factor": 1.0,
    "hepatotoxic_sensitivity_multiplier": 1.0,
    "basis": "Standard healthy-adult reference ranges for ALT, AST, bilirubin, albumin and INR"
  },
  {
    "profile_id": "liver_nafld_early",
    "label": "Early non-alcoholic fatty liver disease (NAFLD), no fibrosis",
    "cause": [
      "Obesity-related fatty liver"
    ],
    "child_pugh_class": "none",
    "child_pugh_score": null,
    "alt_u_l": 55,
    "ast_u_l": 45,
    "total_bilirubin_mg_dl": 0.9,
    "albumin_g_dl": 4.1,
    "inr": 1.0,
    "hepatic_blood_flow_multiplier": 0.95,
    "cyp450_activity_multiplier": 0.9,
    "first_pass_bioavailability_multiplier": 1.0,
    "clearance_scaling_factor": 0.9,
    "hepatotoxic_sensitivity_multiplier": 1.2,
    "basis": "Early fatty liver typically shows mildly elevated ALT/AST with still-normal synthetic function (albumin, INR); clotting and protein levels are unaffected before fibrosis develops"
  },
  {
    "profile_id": "liver_compensated_cirrhosis_childA",
    "label": "Compensated cirrhosis, Child-Pugh A (alcohol-related)",
    "cause": [
      "Alcohol-related liver disease"
    ],
    "child_pugh_class": "A",
    "child_pugh_score": 6,
    "alt_u_l": 60,
    "ast_u_l": 70,
    "total_bilirubin_mg_dl": 1.3,
    "albumin_g_dl": 3.6,
    "inr": 1.2,
    "hepatic_blood_flow_multiplier": 0.75,
    "cyp450_activity_multiplier": 0.65,
    "first_pass_bioavailability_multiplier": 1.3,
    "clearance_scaling_factor": 0.6,
    "hepatotoxic_sensitivity_multiplier": 1.8,
    "basis": "Child-Pugh A is 5-6 points; this profile uses mildly abnormal bilirubin, albumin and INR consistent with that score, with no ascites or encephalopathy"
  },
  {
    "profile_id": "liver_cirrhosis_childB_viral",
    "label": "Cirrhosis, Child-Pugh B (chronic viral hepatitis)",
    "cause": [
      "Chronic hepatitis C"
    ],
    "child_pugh_class": "B",
    "child_pugh_score": 8,
    "alt_u_l": 70,
    "ast_u_l": 85,
    "total_bilirubin_mg_dl": 2.5,
    "albumin_g_dl": 2.9,
    "inr": 1.6,
    "hepatic_blood_flow_multiplier": 0.5,
    "cyp450_activity_multiplier": 0.4,
    "first_pass_bioavailability_multiplier": 1.8,
    "clearance_scaling_factor": 0.35,
    "hepatotoxic_sensitivity_multiplier": 2.5,
    "basis": "Child-Pugh B is 7-9 points; this profile assumes mild ascites controlled with medication, with moderately abnormal bilirubin, albumin and INR"
  },
  {
    "profile_id": "liver_decompensated_cirrhosis_childC",
    "label": "Decompensated cirrhosis, Child-Pugh C",
    "cause": [
      "Advanced cirrhosis, mixed etiology"
    ],
    "child_pugh_class": "C",
    "child_pugh_score": 12,
    "alt_u_l": 50,
    "ast_u_l": 65,
    "total_bilirubin_mg_dl": 5.0,
    "albumin_g_dl": 2.3,
    "inr": 2.2,
    "hepatic_blood_flow_multiplier": 0.25,
    "cyp450_activity_multiplier": 0.2,
    "first_pass_bioavailability_multiplier": 2.5,
    "clearance_scaling_factor": 0.15,
    "hepatotoxic_sensitivity_multiplier": 3.5,
    "basis": "Child-Pugh C is 10-15 points; ALT/AST can actually look lower than Child-Pugh B here because so little functioning liver tissue remains to release enzymes, while bilirubin, albumin and INR are severely abnormal and ascites/encephalopathy are typically present"
  },
  {
    "profile_id": "liver_acute_dili_recovery",
    "label": "Recovering from acute drug-induced liver injury (e.g. paracetamol overdose)",
    "cause": [
      "Recent paracetamol overdose, resolving"
    ],
    "child_pugh_class": "none",
    "child_pugh_score": null,
    "alt_u_l": 450,
    "ast_u_l": 380,
    "total_bilirubin_mg_dl": 2.0,
    "albumin_g_dl": 3.8,
    "inr": 1.4,
    "hepatic_blood_flow_multiplier": 0.9,
    "cyp450_activity_multiplier": 0.6,
    "first_pass_bioavailability_multiplier": 1.2,
    "clearance_scaling_factor": 0.5,
    "hepatotoxic_sensitivity_multiplier": 2.8,
    "basis": "Acute injury shows very high ALT/AST (cell death in progress) with albumin still near-normal because synthetic function has not had time to fall as far as in chronic cirrhosis; INR is elevated because clotting-factor production is acutely impaired; this profile exists to demo acute vs. chronic patterns looking different even at similar overall severity"
  }
];

export const LUNG_PROFILES: LungProfile[] = [
  {
    "profile_id": "lung_healthy_adult",
    "label": "Healthy adult, non-smoker",
    "smoking_status": "never",
    "pack_years": 0,
    "chronic_conditions": [],
    "fev1_pct_predicted": 100,
    "fvc_pct_predicted": 100,
    "fev1_fvc_ratio": 0.8,
    "spo2_rest_pct": 98,
    "spo2_exertion_pct": 97,
    "respiratory_rate_bpm": 14,
    "tidal_volume_ml": 500,
    "dlco_pct_predicted": 100,
    "airway_resistance_multiplier": 1.0,
    "vq_mismatch_index": 0.05,
    "respiratory_drive_sensitivity": 1.0,
    "basis": "Standard healthy-adult reference ranges used in respiratory physiology teaching material"
  },
  {
    "profile_id": "lung_mild_copd_smoker",
    "label": "Mild COPD, current smoker",
    "smoking_status": "current",
    "pack_years": 20,
    "chronic_conditions": [
      "COPD - GOLD stage 1 (mild)"
    ],
    "fev1_pct_predicted": 85,
    "fvc_pct_predicted": 92,
    "fev1_fvc_ratio": 0.68,
    "spo2_rest_pct": 96,
    "spo2_exertion_pct": 93,
    "respiratory_rate_bpm": 16,
    "tidal_volume_ml": 480,
    "dlco_pct_predicted": 85,
    "airway_resistance_multiplier": 1.3,
    "vq_mismatch_index": 0.15,
    "respiratory_drive_sensitivity": 1.0,
    "basis": "GOLD stage 1 defined as FEV1/FVC < 0.70 with FEV1 >= 80% predicted; other values are illustrative midpoints"
  },
  {
    "profile_id": "lung_moderate_copd_smoker",
    "label": "Moderate COPD, long-term smoker",
    "smoking_status": "current",
    "pack_years": 35,
    "chronic_conditions": [
      "COPD - GOLD stage 2 (moderate)",
      "Chronic bronchitis"
    ],
    "fev1_pct_predicted": 65,
    "fvc_pct_predicted": 85,
    "fev1_fvc_ratio": 0.6,
    "spo2_rest_pct": 94,
    "spo2_exertion_pct": 89,
    "respiratory_rate_bpm": 18,
    "tidal_volume_ml": 450,
    "dlco_pct_predicted": 70,
    "airway_resistance_multiplier": 1.8,
    "vq_mismatch_index": 0.3,
    "respiratory_drive_sensitivity": 0.9,
    "basis": "GOLD stage 2 defined as FEV1/FVC < 0.70 with 50% <= FEV1 < 80% predicted"
  },
  {
    "profile_id": "lung_severe_copd_emphysema",
    "label": "Severe COPD with emphysema, former heavy smoker",
    "smoking_status": "former",
    "pack_years": 50,
    "chronic_conditions": [
      "COPD - GOLD stage 3 (severe)",
      "Emphysema"
    ],
    "fev1_pct_predicted": 40,
    "fvc_pct_predicted": 70,
    "fev1_fvc_ratio": 0.48,
    "spo2_rest_pct": 90,
    "spo2_exertion_pct": 82,
    "respiratory_rate_bpm": 20,
    "tidal_volume_ml": 400,
    "dlco_pct_predicted": 45,
    "airway_resistance_multiplier": 2.5,
    "vq_mismatch_index": 0.5,
    "respiratory_drive_sensitivity": 0.7,
    "basis": "GOLD stage 3 defined as FEV1/FVC < 0.70 with 30% <= FEV1 < 50% predicted; reduced DLCO reflects alveolar destruction in emphysema"
  },
  {
    "profile_id": "lung_uncontrolled_asthma",
    "label": "Uncontrolled asthma, non-smoker",
    "smoking_status": "never",
    "pack_years": 0,
    "chronic_conditions": [
      "Asthma - poorly controlled"
    ],
    "fev1_pct_predicted": 70,
    "fvc_pct_predicted": 90,
    "fev1_fvc_ratio": 0.65,
    "spo2_rest_pct": 95,
    "spo2_exertion_pct": 91,
    "respiratory_rate_bpm": 18,
    "tidal_volume_ml": 460,
    "dlco_pct_predicted": 95,
    "airway_resistance_multiplier": 2.0,
    "vq_mismatch_index": 0.25,
    "respiratory_drive_sensitivity": 1.1,
    "basis": "Asthma is primarily reversible airway obstruction; DLCO is typically near-normal unlike COPD, which is the key distinguishing feature to encode"
  },
  {
    "profile_id": "lung_pulmonary_fibrosis",
    "label": "Idiopathic pulmonary fibrosis, former smoker",
    "smoking_status": "former",
    "pack_years": 15,
    "chronic_conditions": [
      "Pulmonary fibrosis"
    ],
    "fev1_pct_predicted": 60,
    "fvc_pct_predicted": 55,
    "fev1_fvc_ratio": 0.88,
    "spo2_rest_pct": 93,
    "spo2_exertion_pct": 85,
    "respiratory_rate_bpm": 22,
    "tidal_volume_ml": 380,
    "dlco_pct_predicted": 40,
    "airway_resistance_multiplier": 1.1,
    "vq_mismatch_index": 0.35,
    "respiratory_drive_sensitivity": 1.2,
    "basis": "Fibrosis is a restrictive pattern: FEV1/FVC ratio is normal or high (unlike obstructive COPD/asthma) because both volumes fall together, while DLCO drops sharply from thickened alveolar walls"
  }
];

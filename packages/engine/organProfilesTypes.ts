/**
 * Synthetic organ reference profiles for the simulation.
 * Sourced from NYHA cardiac stages, CKD stages, Child-Pugh liver staging, and GOLD COPD/asthma reference data.
 */

export type HeartProfileId =
  | "heart_healthy_adult"
  | "heart_hypertensive_lvh"
  | "heart_mild_hfref"
  | "heart_moderate_hfref"
  | "heart_severe_hfref_post_mi"
  | "heart_atrial_fibrillation";

export interface HeartProfile {
  profile_id: HeartProfileId;
  label: string;
  conditions: string[];
  nyha_class: string;
  lvef_pct: number;
  resting_heart_rate_bpm: number;
  cardiac_output_l_min: number;
  mean_arterial_pressure_mmhg: number;
  baseline_qt_interval_ms: number;
  contractility_multiplier: number;
  conduction_sensitivity_multiplier: number;
  cardiotoxic_sensitivity_multiplier: number;
  basis: string;
}

export type KidneyProfileId =
  | "kidney_healthy_adult"
  | "kidney_ckd_stage2_diabetic"
  | "kidney_ckd_stage3_hypertensive"
  | "kidney_ckd_stage4_diabetic_hypertensive"
  | "kidney_aki_recovery"
  | "kidney_ckd_stage5_failure";

export interface KidneyProfile {
  profile_id: KidneyProfileId;
  label: string;
  comorbidities: string[];
  egfr_ml_min_1_73m2: number;
  ckd_stage: string;
  serum_creatinine_mg_dl: number;
  bun_mg_dl: number;
  urine_acr_mg_g: number;
  mean_arterial_pressure_mmhg: number;
  nephrotoxic_sensitivity_multiplier: number;
  clearance_scaling_factor: number;
  basis: string;
}

export type LiverProfileId =
  | "liver_healthy_adult"
  | "liver_nafld_early"
  | "liver_compensated_cirrhosis_childA"
  | "liver_cirrhosis_childB_viral"
  | "liver_decompensated_cirrhosis_childC"
  | "liver_acute_dili_recovery";

export interface LiverProfile {
  profile_id: LiverProfileId;
  label: string;
  cause: string[];
  child_pugh_class: string;
  child_pugh_score: number | null;
  alt_u_l: number;
  ast_u_l: number;
  total_bilirubin_mg_dl: number;
  albumin_g_dl: number;
  inr: number;
  hepatic_blood_flow_multiplier: number;
  cyp450_activity_multiplier: number;
  first_pass_bioavailability_multiplier: number;
  clearance_scaling_factor: number;
  hepatotoxic_sensitivity_multiplier: number;
  basis: string;
}

export type LungProfileId =
  | "lung_healthy_adult"
  | "lung_mild_copd_smoker"
  | "lung_moderate_copd_smoker"
  | "lung_severe_copd_emphysema"
  | "lung_uncontrolled_asthma"
  | "lung_pulmonary_fibrosis";

export interface LungProfile {
  profile_id: LungProfileId;
  label: string;
  smoking_status: string;
  pack_years: number;
  chronic_conditions: string[];
  fev1_pct_predicted: number;
  fvc_pct_predicted: number;
  fev1_fvc_ratio: number;
  spo2_rest_pct: number;
  spo2_exertion_pct: number;
  respiratory_rate_bpm: number;
  tidal_volume_ml: number;
  dlco_pct_predicted: number;
  airway_resistance_multiplier: number;
  vq_mismatch_index: number;
  respiratory_drive_sensitivity: number;
  basis: string;
}

export interface OrganProfileSelection {
  heartId?: HeartProfileId;
  kidneyId?: KidneyProfileId;
  liverId?: LiverProfileId;
  lungId?: LungProfileId;
}


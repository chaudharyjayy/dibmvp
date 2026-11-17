/**
 * The organ physiology surface the simulator UI reads.
 *
 * The profile archetypes themselves (HeartProfile, LiverProfile, …) live in
 * organProfilesTypes.ts so there is one definition of each dataset row. This
 * module only adds what the UI needs on top of them: how a selection is
 * expressed, and the per-timepoint signal series the organ monitor plots.
 */

import type { HeartProfile, KidneyProfile, LiverProfile, LungProfile } from './organProfilesTypes';

export type { HeartProfile, KidneyProfile, LiverProfile, LungProfile };

/** The four organs with a dataset. */
export type OrganProfileMap = {
  heart: HeartProfile;
  liver: LiverProfile;
  kidney: KidneyProfile;
  lung: LungProfile;
};

export type OrganType = keyof OrganProfileMap;

/**
 * The profile ids the user picked in the console. Looser than the strict
 * union in organProfilesTypes because the values arrive from form state.
 */
export interface SelectedOrganProfiles {
  heart?: string;
  liver?: string;
  kidney?: string;
  lung?: string;
}

/** Per-timepoint organ signals, aligned with the simulation's `tH` grid. */
export interface OrganSimulationSignals {
  // Heart
  heartRateBpm: number[];
  ejectionFractionPct: number[];
  qtIntervalMs: number[];
  cardiacOutputLMin: number[];

  // Liver
  altUL: number[];
  effectiveClearanceRateLPerH: number[];
  hepaticExposureScore: number[];

  // Kidney
  egfrMlMin: number[];
  serumCreatinineMgDl: number[];
  renalEliminationRateMgPerH: number[];

  // Lung
  spo2Pct: number[];
  respiratoryRateBpm: number[];
  airwayResistanceIndex: number[];
}

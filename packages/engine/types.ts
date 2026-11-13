export interface BodyProfile {
  ageYears: number;
  weightKg: number;
  sex: 'M' | 'F' | 'other';
}

export interface DoseEvent {
  drugId: string;
  doseMg: number;
  timeH: number;
}

export interface SimResult {
  tH: number[];
  gutMg: number[];
  bodyMg: number[];
  concMgPerL: number[];
  eliminationMgPerH: number[];
  cmaxMgPerL: number;
  tmaxH: number;
  timeToClearH: number | null;
  /** Non-fatal warnings, e.g. doses outside the range the source studied. */
  warnings: string[];
}

/**
 * Matches the data/drugs.json schema in the TRD.
 * Numeric parameter fields are `null` until a value is sourced
 * from PK-DB / an official drug label — never invented.
 */
export interface Drug {
  id: string;
  name: string;
  route: 'oral' | 'iv';
  model: 'one-compartment' | 'two-compartment';
  /** Absorption rate constant (1/h). */
  ka_per_h: number | null;
  /** Oral bioavailability (0..1). */
  F: number | null;
  /** Plasma clearance (L/h/kg). */
  CL_L_per_h_per_kg: number | null;
  /** Volume of distribution (L/kg). */
  V_L_per_kg: number | null;
  /** Two-compartment rate constants (1/h), optional — TRD extension. */
  k12?: number;
  k21?: number;
  studied_dose_range_mg: [number, number] | null;
  sources: string[];
  notes: string;
}

export interface SimInput {
  profile: BodyProfile;
  drug: Drug;
  doses: DoseEvent[];
  tEndH: number;
  dtH?: number;
}

export interface Report {
  headline: string;
  bullets: string[];
  disclaimer: string;
}

export type InteractionPair = {
  a: string;
  b: string;
  severity: 'major' | 'moderate' | 'minor';
  mechanism: string;
  source: string;
};

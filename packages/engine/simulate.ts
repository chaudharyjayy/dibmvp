import { SimInput, SimResult, DoseEvent, Drug } from './types';

const kaOf = (drug: Drug): number | null => drug.ka_per_h;
const fOf = (drug: Drug): number => drug.F ?? 1;
const vOf = (drug: Drug): number | null => drug.V_L_per_kg;
const clOf = (drug: Drug): number | null => drug.CL_L_per_h_per_kg;

/**
 * One-compartment model with gut depot and first-order absorption:
 *   dAg/dt = -ka * Ag
 *   dA/dt  = F * ka * Ag - (CL/V) * A
 *   C = A / V
 *
 * SCALING ASSUMPTION (documented per TRD): parameter fields are stored per kg
 * of body weight, so
 *   V  = V_L_per_kg          * weightKg
 *   CL = CL_L_per_h_per_kg   * weightKg
 * and the elimination rate constant is ke = CL / V. Age or sex effects are
 * only applied when a data source supports them; none are used here yet.
 *
 * Doses are injected into the gut depot at their event time (stepped through
 * in time order) and the system is integrated with RK4 at a fixed step
 * (default 0.05 h). A dose falling between steps is applied at the start of
 * the first step at or after its time.
 */
export function simulate(input: SimInput): SimResult {
  // ---- validation ---------------------------------------------------------
  if (!input || typeof input !== 'object') {
    throw new Error('simulate: input object is required');
  }
  const { profile, drug, doses, tEndH } = input;
  const dtH = input.dtH ?? 0.05;

  if (!profile || typeof profile.weightKg !== 'number' || Number.isNaN(profile.weightKg) || profile.weightKg <= 0) {
    throw new Error('simulate: profile.weightKg must be a number greater than 0');
  }
  if (!drug || !drug.name || !drug.id) {
    throw new Error('simulate: unknown drug (drug with non-empty id and name is required)');
  }
  if (!Array.isArray(doses)) {
    throw new Error('simulate: doses must be an array');
  }
  for (const d of doses) {
    if (typeof d.doseMg !== 'number' || Number.isNaN(d.doseMg) || d.doseMg < 0) {
      throw new Error(`simulate: negative or invalid dose (${d.doseMg} mg)`);
    }
    if (typeof d.timeH !== 'number' || Number.isNaN(d.timeH) || d.timeH < 0) {
      throw new Error(`simulate: invalid dose time (${d.timeH})`);
    }
  }
  if (typeof tEndH !== 'number' || tEndH <= 0) {
    throw new Error('simulate: tEndH must be a positive number of hours');
  }
  if (typeof dtH !== 'number' || dtH <= 0) {
    throw new Error('simulate: dtH must be a positive step size in hours');
  }

  const warnings: string[] = [];
  if (drug.label_dose_range_mg) {
    const [min, max] = drug.label_dose_range_mg as [number, number];
    for (const d of doses) {
      if (d.doseMg < min || d.doseMg > max) {
        warnings.push(
          `Dose ${d.doseMg} mg at t=${d.timeH} h is outside the label range ${min}–${max} mg for ${drug.name}.`
        );
      }
    }
  }

  // ---- model selection ----------------------------------------------------
  if (drug.model === 'two-compartment') {
    if (drug.k12 == null || drug.k21 == null) {
      throw new Error('simulate: two-compartment model requires k12 and k21');
    }
    throw new Error('simulate: two-compartment model is not implemented yet');
  }
  if (drug.model !== 'one-compartment') {
    throw new Error(`simulate: unknown drug model "${drug.model}"`);
  }

  const ka = kaOf(drug);
  const F = fOf(drug);
  const vPerKg = vOf(drug);
  const clPerKg = clOf(drug);
  if (ka == null || vPerKg == null || clPerKg == null) {
    throw new Error(
      `simulate: drug parameters missing for ${drug.name} — ka_per_h, V_L_per_kg, CL_L_per_h_per_kg are required (TODO: source from PK-DB / label)`
    );
  }
  if (ka <= 0) throw new Error('simulate: ka_per_h must be > 0');
  if (vPerKg <= 0) throw new Error('simulate: V_L_per_kg must be > 0');
  if (clPerKg < 0) throw new Error('simulate: CL_L_per_h_per_kg must be >= 0');
  if (F <= 0 || F > 1) throw new Error('simulate: F (bioavailability) must be in (0, 1]');

  // ---- model parameters (per-kg scaling, see header comment) ---------------
  const V = vPerKg * profile.weightKg; // L
  const CL = clPerKg * profile.weightKg; // L/h
  const ke = CL / V; // 1/h

  // ---- integration --------------------------------------------------------
  const sorted: DoseEvent[] = [...doses].sort((a, b) => a.timeH - b.timeH);
  const tOut: number[] = [];
  const gutOut: number[] = [];
  const bodyOut: number[] = [];
  const concOut: number[] = [];
  const elimOut: number[] = [];

  let Ag = 0; // gut depot (mg)
  let A = 0; // central compartment amount (mg)
  let doseIdx = 0;

  const record = (t: number) => {
    tOut.push(t);
    gutOut.push(Ag);
    bodyOut.push(A);
    concOut.push(A / V);
    elimOut.push(ke * A); // mg/h
  };

  const pushDosesAtOrBefore = (t: number) => {
    while (doseIdx < sorted.length && sorted[doseIdx].timeH <= t + 1e-12) {
      Ag += sorted[doseIdx].doseMg;
      doseIdx++;
    }
  };

  pushDosesAtOrBefore(0);
  record(0);

  const deriv = (gut: number, amt: number): [number, number] => {
    const dAg = -ka * gut;
    const dA = F * ka * gut - ke * amt;
    return [dAg, dA];
  };

  let t = 0;
  while (t < tEndH - 1e-12) {
    const step = Math.min(dtH, tEndH - t);
    const [k1g, k1a] = deriv(Ag, A);
    const [k2g, k2a] = deriv(Ag + (step / 2) * k1g, A + (step / 2) * k1a);
    const [k3g, k3a] = deriv(Ag + (step / 2) * k2g, A + (step / 2) * k2a);
    const [k4g, k4a] = deriv(Ag + step * k3g, A + step * k3a);

    const gNext = Ag + (step / 6) * (k1g + 2 * k2g + 2 * k3g + k4g);
    const aNext = A + (step / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);

    t += step;
    Ag = gNext;
    A = aNext;
    pushDosesAtOrBefore(t);
    record(t);
  }

  if (doseIdx < sorted.length) {
    throw new Error('simulate: internal error — a dose event was never applied');
  }

  // ---- metrics ------------------------------------------------------------
  let cmax = concOut[0] ?? 0;
  let imax = 0;
  for (let i = 1; i < concOut.length; i++) {
    if (concOut[i] > cmax) {
      cmax = concOut[i];
      imax = i;
    }
  }
  const tmax = tOut[imax];

  // timeToClearH: first time after Tmax where conc < 5% of Cmax, else null
  let timeToClear: number | null = null;
  const threshold = 0.05 * cmax;
  for (let i = imax + 1; i < concOut.length; i++) {
    if (concOut[i] < threshold) {
      timeToClear = tOut[i];
      break;
    }
  }

  return {
    tH: tOut,
    gutMg: gutOut,
    bodyMg: bodyOut,
    concMgPerL: concOut,
    eliminationMgPerH: elimOut,
    cmaxMgPerL: cmax,
    tmaxH: tmax,
    timeToClearH: timeToClear,
    warnings,
  };
}

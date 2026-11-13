import { SimInput, SimResult, DoseEvent } from './types';

/**
 * Analytic (closed-form) solution of the one-compartment oral model for a
 * SINGLE dose event — used only by tests as an independent check on
 * simulate(). Same per-kg scaling assumption as simulate().
 *
 * For a dose D entering the gut at time t0:
 *   Ag(t) = D * e^{-ka Δt}                                  t >= t0
 *   A(t)  = D * F*ka / (V (ka - ke)) * (e^{-ke Δt} - e^{-ka Δt})
 * with the ka ≈ ke limiting case (no division by zero):
 *   A(t)  = D * F*ka * Δt * e^{-ka Δt} / V
 */
export function closedFormSingleDose(input: SimInput, dose?: DoseEvent): SimResult {
  const { profile, drug, tEndH } = input;
  const dtH = input.dtH ?? 0.05;
  const event = dose ?? (input.doses && input.doses[0]);
  if (!event) throw new Error('closedFormSingleDose: a dose event is required');
  if (input.doses && input.doses.length > 1) {
    throw new Error('closedFormSingleDose: call once per dose event (use closedFormDoses for superposition)');
  }

  if (!profile || typeof profile.weightKg !== 'number' || profile.weightKg <= 0) {
    throw new Error('closedFormSingleDose: profile.weightKg must be > 0');
  }
  if (!drug || !drug.name || !drug.id) throw new Error('closedFormSingleDose: unknown drug');
  if (event.doseMg < 0) throw new Error('closedFormSingleDose: dose must be non-negative');
  if (drug.ka_per_h == null || drug.V_L_per_kg == null || drug.CL_L_per_h_per_kg == null) {
    throw new Error('closedFormSingleDose: drug parameters missing (ka_per_h, V_L_per_kg, CL_L_per_h_per_kg)');
  }
  if (drug.model === 'two-compartment') {
    throw new Error('closedFormSingleDose: implemented for the one-compartment model only');
  }

  const ka = drug.ka_per_h;
  const F = drug.F ?? 1;
  const V = drug.V_L_per_kg * profile.weightKg; // L
  const ke = (drug.CL_L_per_h_per_kg * profile.weightKg) / V; // 1/h
  const tlag = drug.tlag_h ?? 0;
  if (!Number.isFinite(tlag) || tlag < 0) {
    throw new Error('closedFormSingleDose: tlag_h must be a finite number >= 0');
  }

  const tOut: number[] = [];
  const gutOut: number[] = [];
  const bodyOut: number[] = [];
  const concOut: number[] = [];
  const elimOut: number[] = [];

  const dt = dtH;
  const n = Math.round(tEndH / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const d = t - (event.timeH + tlag); // Δt since the dose reaches the gut
    let gut: number;
    let amt: number;
    if (d < 0) {
      gut = 0;
      amt = 0;
    } else {
      gut = event.doseMg * Math.exp(-ka * d);
      if (Math.abs(ka - ke) < 1e-9) {
        amt = event.doseMg * F * ka * d * Math.exp(-ka * d); // amount (mg), ka == ke limit — no division by zero
      } else {
        amt = ((event.doseMg * F * ka) / (ka - ke)) * (Math.exp(-ke * d) - Math.exp(-ka * d)); // amount (mg)
      }
    }
    tOut.push(t);
    gutOut.push(gut);
    bodyOut.push(amt);
    concOut.push(amt / V);
    elimOut.push(ke * amt);
  }

  let cmax = concOut[0];
  let imax = 0;
  for (let i = 1; i < concOut.length; i++) {
    if (concOut[i] > cmax) {
      cmax = concOut[i];
      imax = i;
    }
  }
  const tmax = tOut[imax];

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
    warnings: [],
  };
}

/** Sum of single-dose closed-form curves (exact for this linear model). */
export function closedFormDoses(input: SimInput): SimResult {
  if (!input.doses || input.doses.length === 0) {
    throw new Error('closedFormDoses: at least one dose event is required');
  }
  const parts = input.doses.map((d) => closedFormSingleDose({ ...input, doses: [d] }, d));
  const count = Math.round(input.tEndH / (input.dtH ?? 0.05));
  const sumAt = (key: 'gutMg' | 'bodyMg' | 'concMgPerL' | 'eliminationMgPerH', i: number) =>
    parts.reduce((s, p) => s + p[key][i], 0);

  const out: SimResult = {
    tH: parts[0].tH.slice(0, count + 1),
    gutMg: parts[0].gutMg.slice(0, count + 1).map((_, i) => sumAt('gutMg', i)),
    bodyMg: parts[0].bodyMg.slice(0, count + 1).map((_, i) => sumAt('bodyMg', i)),
    concMgPerL: parts[0].concMgPerL.slice(0, count + 1).map((_, i) => sumAt('concMgPerL', i)),
    eliminationMgPerH: parts[0].eliminationMgPerH
      .slice(0, count + 1)
      .map((_, i) => sumAt('eliminationMgPerH', i)),
    cmaxMgPerL: 0,
    tmaxH: 0,
    timeToClearH: null,
    warnings: [],
  };
  out.cmaxMgPerL = Math.max(...out.concMgPerL);
  const imax = out.concMgPerL.indexOf(out.cmaxMgPerL);
  out.tmaxH = out.tH[imax];
  const threshold = 0.05 * out.cmaxMgPerL;
  for (let i = imax + 1; i < out.concMgPerL.length; i++) {
    if (out.concMgPerL[i] < threshold) {
      out.timeToClearH = out.tH[i];
      break;
    }
  }
  return out;
}

import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate';
import { closedFormSingleDose, closedFormDoses } from '../closedFormSingleDose';
import { buildReport } from '../buildReport';
import { lookupInteraction } from '../lookupInteraction';
import { fixtureDrug, fixtureDrugEqualRates } from './fixtures/fixtureDrug';
import { BodyProfile, DoseEvent, InteractionPair, SimResult } from '../types';

const profile: BodyProfile = { ageYears: 30, weightKg: 70, sex: 'M' };
const singleDose: DoseEvent[] = [{ drugId: 'fixture-drug', doseMg: 100, timeH: 0 }];

const run = (drug: typeof fixtureDrug, doses: DoseEvent[], tEndH = 24, dtH = 0.05) =>
  simulate({ profile, drug, doses, tEndH, dtH });

const meanAbsRelErr = (a: number[], b: number[]) => {
  // Only compare points where the analytic curve is meaningfully non-zero.
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(b[i]) < 1e-9) continue;
    s += Math.abs(a[i] - b[i]) / Math.abs(b[i]);
    n++;
  }
  return n === 0 ? 0 : s / n;
};

describe('simulate() vs closedFormSingleDose()', () => {
  it('conc curve matches the analytic solution within 1% (single dose)', () => {
    const numeric = run(fixtureDrug, singleDose);
    const analytic = closedFormSingleDose({ profile, drug: fixtureDrug, doses: singleDose, tEndH: 24, dtH: 0.05 });
    expect(meanAbsRelErr(numeric.concMgPerL, analytic.concMgPerL)).toBeLessThan(0.01);
    expect(Math.abs(numeric.cmaxMgPerL - analytic.cmaxMgPerL) / analytic.cmaxMgPerL).toBeLessThan(0.01);
    expect(Math.abs(numeric.tmaxH - analytic.tmaxH)).toBeLessThan(0.1);
  });

  it('handles ka ≈ ke without dividing by zero (edge case)', () => {
    const numeric = run(fixtureDrugEqualRates, singleDose);
    const analytic = closedFormSingleDose({ profile, drug: fixtureDrugEqualRates, doses: singleDose, tEndH: 24, dtH: 0.05 });
    expect(numeric.cmaxMgPerL).toBeGreaterThan(0);
    expect(meanAbsRelErr(numeric.concMgPerL, analytic.concMgPerL)).toBeLessThan(0.02);
  });
});

describe('mass balance', () => {
  it('total dose = gut depot + cumulative elimination (+ small integration error)', () => {
    const res = run(fixtureDrug, singleDose, 24, 0.02);
    const cumElim = res.eliminationMgPerH.reduce((s, r, i) => (i > 0 ? s + r * (res.tH[i] - res.tH[i - 1]) : 0), 0);
    const gutFinal = res.gutMg[res.gutMg.length - 1];
    const bodyFinal = res.bodyMg[res.bodyMg.length - 1];
    const doseTotal = 100;
    expect(gutFinal).toBeCloseTo(0, 1); // essentially all absorbed from gut
    // absorbed = in body + eliminated (within integration error)
    expect((gutFinal + bodyFinal + cumElim) / doseTotal).toBeGreaterThan(0.99);
    expect(gutFinal + bodyFinal + cumElim).toBeLessThanOrEqual(doseTotal * 1.02);
  });
});

describe('linear superposition (multi-dose)', () => {
  it('multi-dose curve = sum of shifted single-dose curves', () => {
    const doses: DoseEvent[] = [
      { drugId: 'fixture-drug', doseMg: 100, timeH: 0 },
      { drugId: 'fixture-drug', doseMg: 100, timeH: 6 },
    ];
    const multi = run(fixtureDrug, doses);
    const n = multi.concMgPerL.length;
    const d1 = closedFormSingleDose({ profile, drug: fixtureDrug, doses: [doses[0]], tEndH: 24, dtH: 0.05 });
    const d2 = closedFormSingleDose({ profile, drug: fixtureDrug, doses: [doses[1]], tEndH: 24, dtH: 0.05 });
    const summed = multi.concMgPerL.map((_, i) => d1.concMgPerL[i] + d2.concMgPerL[i]);
    expect(meanAbsRelErr(multi.concMgPerL, summed)).toBeLessThan(0.02);
    expect(n).toBeGreaterThan(0);
  });
});

describe('absorption lag (tlag_h)', () => {
  const lagged = { ...fixtureDrug, tlag_h: 1.5 };
  const shiftedDose = [{ drugId: 'fixture-drug', doseMg: 100, timeH: 1.5 }];

  it('with tlag_h absent or 0, output is identical to the unlagged baseline', () => {
    const baseline = run(fixtureDrug, singleDose);
    const zeroLag = run({ ...fixtureDrug, tlag_h: 0 }, singleDose);
    expect(zeroLag.tH).toEqual(baseline.tH);
    expect(zeroLag.gutMg).toEqual(baseline.gutMg);
    expect(zeroLag.bodyMg).toEqual(baseline.bodyMg);
    expect(zeroLag.concMgPerL).toEqual(baseline.concMgPerL);
    expect(zeroLag.eliminationMgPerH).toEqual(baseline.eliminationMgPerH);
    expect(zeroLag.cmaxMgPerL).toBe(baseline.cmaxMgPerL);
    expect(zeroLag.tmaxH).toBe(baseline.tmaxH);
    expect(zeroLag.timeToClearH).toBe(baseline.timeToClearH);
  });

  it('with tlag_h set, the run equals the same drug with the dose shifted by the lag', () => {
    const delayed = run(lagged, singleDose);
    const shifted = run(fixtureDrug, shiftedDose);
    expect(delayed.gutMg).toEqual(shifted.gutMg);
    expect(delayed.bodyMg).toEqual(shifted.bodyMg);
    expect(delayed.concMgPerL).toEqual(shifted.concMgPerL);
    expect(delayed.eliminationMgPerH).toEqual(shifted.eliminationMgPerH);
    expect(delayed.cmaxMgPerL).toBeCloseTo(shifted.cmaxMgPerL, 12);
    expect(delayed.tmaxH).toBeCloseTo(shifted.tmaxH, 10);
  });

  it('holds mass at zero before the dose reaches the gut', () => {
    const res = run(lagged, singleDose, 6, 0.05);
    for (let i = 0; i < res.tH.length; i++) {
      if (res.tH[i] < 1.5) {
        expect(res.gutMg[i]).toBe(0);
        expect(res.bodyMg[i]).toBe(0);
        expect(res.concMgPerL[i]).toBe(0);
        expect(res.eliminationMgPerH[i]).toBe(0);
      }
    }
    // By t = 6 h, the gut holds e^{-1/h * 4.5 h} * 100 mg ≈ 1.11 mg (a fact of the ka value, not an error).
    expect(res.gutMg[res.gutMg.length - 1]).toBeLessThan(1.5);
  });

  it('tmax shifts by exactly tlag_h at grid resolution', () => {
    const base = run(fixtureDrug, singleDose).tmaxH;
    const delayed = run(lagged, singleDose).tmaxH;
    expect(Math.abs(delayed - base - 1.5)).toBeLessThanOrEqual(0.05);
  });

  it('mass balance holds with a lag', () => {
    const res = run(lagged, singleDose, 24, 0.02);
    const cumElim = res.eliminationMgPerH.reduce(
      (acc, r, i) => (i > 0 ? acc + r * (res.tH[i] - res.tH[i - 1]) : acc),
      0
    );
    const gutFinal = res.gutMg[res.gutMg.length - 1];
    const bodyFinal = res.bodyMg[res.bodyMg.length - 1];
    expect(gutFinal).toBeCloseTo(0, 1);
    expect(gutFinal + bodyFinal + cumElim).toBeGreaterThan(99);
    expect(gutFinal + bodyFinal + cumElim).toBeLessThanOrEqual(102);
  });

  it('simulate() agrees with closedFormSingleDose() when tlag_h is set', () => {
    const numeric = run(lagged, singleDose, 24, 0.05);
    const analytic = closedFormSingleDose({ profile, drug: lagged, doses: singleDose, tEndH: 24, dtH: 0.05 });
    expect(meanAbsRelErr(numeric.concMgPerL, analytic.concMgPerL)).toBeLessThan(0.01);
    expect(numeric.tmaxH).toBeCloseTo(analytic.tmaxH, 1);
  });
});

describe('result invariants & known-case metrics', () => {
  it('concentration and amounts are never negative', () => {
    const res = run(fixtureDrug, singleDose);
    for (const arr of [res.concMgPerL, res.gutMg, res.bodyMg, res.eliminationMgPerH]) {
      expect(arr.every((v) => v >= 0)).toBe(true);
    }
  });

  it('Cmax/Tmax match the analytic tmax = ln(ka/ke)/(ka-ke)', () => {
    const res = run(fixtureDrug, singleDose);
    const ka = 1.0;
    const ke = 0.14;
    const expectedTmax = Math.log(ka / ke) / (ka - ke);
    const expectedCmax =
      ((100 * 1 * ka) / (5 * 70 * (ka - ke))) * (Math.exp(-ke * expectedTmax) - Math.exp(-ka * expectedTmax));
    expect(res.cmaxMgPerL).toBeCloseTo(expectedCmax, 4);
    expect(res.tmaxH).toBeCloseTo(expectedTmax, 1);
  });

  it('timeToClearH is the first post-Tmax time below 5% of Cmax', () => {
    const res = run(fixtureDrug, singleDose, 48, 0.02);
    expect(res.timeToClearH).not.toBeNull();
    const tmaxIdx = res.tH.findIndex((t) => t === res.tmaxH);
    const threshold = 0.05 * res.cmaxMgPerL;
    const firstClearIdx = res.concMgPerL.findIndex(
      (c, i) => i > tmaxIdx && c < threshold
    );
    expect(res.timeToClearH).toBe(res.tH[firstClearIdx]);
  });

  it('returns null timeToClear when 5% of Cmax is not reached within tEndH', () => {
    const res = run(fixtureDrug, singleDose, 3, 0.05); // too short a window
    expect(res.timeToClearH).toBeNull();
  });
});

describe('input validation & dose-range warnings', () => {
  it('throws for weight <= 0', () => {
    expect(() =>
      simulate({ profile: { ...profile, weightKg: 0 }, drug: fixtureDrug, doses: singleDose, tEndH: 24, dtH: 0.05 })
    ).toThrow(/weight/i);
  });

  it('throws for negative doses', () => {
    expect(() => run(fixtureDrug, [{ drugId: 'x', doseMg: -5, timeH: 0 }])).toThrow(/dose/i);
  });

  it('throws for unknown drug', () => {
    expect(() =>
      simulate({
        profile,
        doses: singleDose,
        tEndH: 24,
        dtH: 0.05,
        drug: { ...(fixtureDrug as any), name: '' },
      })
    ).toThrow(/unknown drug/i);
  });

  it('returns a warning (not a throw) for doses outside the range the source studied', () => {
    const doses: DoseEvent[] = [{ drugId: 'fixture-drug', doseMg: 1000, timeH: 0 }];
    const res = run(fixtureDrug, doses);
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toMatch(/outside the range the source studied/i);
  });

  it('throws when one-compartment parameters are missing', () => {
    const noParams = { ...fixtureDrug, ka_per_h: null, F: null, V_L_per_kg: null, CL_L_per_h_per_kg: null };
    expect(() => run(noParams as any, singleDose)).toThrow(/parameters missing/i);
  });

  it('throws when F is missing rather than assuming 1.0', () => {
    const noF = { ...fixtureDrug, F: null };
    expect(() => run(noF as any, singleDose)).toThrow(/parameters missing/i);
  });

  it('rejects non-finite weights, times and step sizes', () => {
    expect(() => run(fixtureDrug, singleDose, Infinity)).toThrow(/finite/i);
    expect(() => run(fixtureDrug, singleDose, 24, NaN)).toThrow(/finite/i);
    expect(() =>
      simulate({ profile: { ...profile, weightKg: Infinity }, drug: fixtureDrug, doses: singleDose, tEndH: 24, dtH: 0.05 })
    ).toThrow(/finite/i);
    expect(() => run(fixtureDrug, [{ drugId: 'x', doseMg: NaN, timeH: 0 }])).toThrow(/dose/i);
  });

  it('drops a dose outside the window with a warning instead of throwing', () => {
    const doses: DoseEvent[] = [
      { drugId: 'fixture-drug', doseMg: 100, timeH: 0 },
      { drugId: 'fixture-drug', doseMg: 100, timeH: 18 },
    ];
    const res = run(fixtureDrug, doses, 12);
    expect(res.warnings.some((w) => /outside the simulated window/i.test(w))).toBe(true);
    expect(res.cmaxMgPerL).toBeGreaterThan(0);
  });

  it('stays finite for stiff absorption (ka = 60 /h)', () => {
    const stiff = { ...fixtureDrug, ka_per_h: 60 };
    const res = simulate({ profile, drug: stiff, doses: singleDose, tEndH: 6, dtH: 0.05 });
    expect(Number.isFinite(res.cmaxMgPerL)).toBe(true);
    expect(res.concMgPerL.every((c) => Number.isFinite(c) && c >= 0)).toBe(true);
    // no more than the whole dose in one litre of the model volume
    expect(res.cmaxMgPerL).toBeLessThan(100 / (5 * 70) + 1e-9);
  });

  it('scales both V and CL with weight, so half-life is unchanged and peak falls', () => {
    const light = simulate({ profile: { ...profile, weightKg: 70 }, drug: fixtureDrug, doses: singleDose, tEndH: 24, dtH: 0.05 });
    const heavy = simulate({ profile: { ...profile, weightKg: 100 }, drug: fixtureDrug, doses: singleDose, tEndH: 24, dtH: 0.05 });
    expect(heavy.cmaxMgPerL).toBeLessThan(light.cmaxMgPerL);
    expect(heavy.cmaxMgPerL / light.cmaxMgPerL).toBeCloseTo(0.7, 2);
    expect(Math.abs(heavy.tmaxH - light.tmaxH)).toBeLessThan(0.1);
  });
});

describe('buildReport()', () => {
  it('always includes the disclaimer and stays within the template vocabulary', () => {
    const res = run(fixtureDrug, singleDose);
    const report = buildReport(res);
    expect(report.disclaimer).toBe(
      'Educational simulator. Population-average estimate. Not medical or dosing advice.'
    );
    expect(report.bullets.length).toBeGreaterThanOrEqual(3);
    expect(report.headline.length).toBeGreaterThan(0);
  });
});

describe('lookupInteraction()', () => {
  const pairs: InteractionPair[] = [
    {
      a: 'caffeine',
      b: 'paracetamol',
      severity: 'minor',
      mechanism: 'TEST PAIR (citation TODO)',
      source: 'TODO',
    },
  ];

  it('finds the pair in either order', () => {
    expect(lookupInteraction('caffeine', 'paracetamol', pairs).found).toBe(true);
    expect(lookupInteraction('paracetamol', 'caffeine', pairs).found).toBe(true);
  });

  it('uses the not-found wording without implying absence is safe', () => {
    const r = lookupInteraction('ibuprofen', 'paracetamol', pairs);
    expect(r.found).toBe(false);
    expect(r.message).toBe('Not in our small verified set');
  });
});

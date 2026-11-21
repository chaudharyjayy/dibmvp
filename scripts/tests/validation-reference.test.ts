import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The validation file is what the correctness gate compares the engine
 * against, so every published number in it must come from a quoted line of a
 * real source. A comparator that is not in its own quote is a number someone
 * typed in, which is exactly what this repository refuses to ship.
 */

type Reference = {
  drug_id: string;
  reference_dose_mg: number;
  cmax_mg_per_l: number | null;
  tmax_h: number | null;
  source_url: string | null;
  source_quote: string | null;
  tmax_quote?: string | null;
  source_title: string | null;
  kind: string;
  withdrawn_tmax?: { value: number; source: string; reason: string } | null;
};

const doc = JSON.parse(
  readFileSync(new URL('../../data/validation.json', import.meta.url), 'utf8')
) as { references: Reference[] };

/** Every number printed in a quote, with the thousands separators removed. */
const numbersIn = (text: string): number[] =>
  (text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/**
 * True when the quote states the value. Cmax is quoted in ng/mL and stored in
 * mg/L, so the same number can appear either way round.
 */
const quoteStates = (quote: string, value: number): boolean =>
  numbersIn(quote).some(
    (n) => Math.abs(n - value) < 1e-9 || Math.abs(n - value * 1000) < 1e-6
  );

describe('published references', () => {
  it('gives every comparator a source and a quoted row', () => {
    for (const ref of doc.references) {
      if (ref.cmax_mg_per_l != null) {
        expect(ref.source_url, ref.drug_id).toBeTruthy();
        expect(ref.source_quote, ref.drug_id).toBeTruthy();
      }
      if (ref.tmax_h != null) {
        expect(ref.source_url, ref.drug_id).toBeTruthy();
        expect(ref.tmax_quote, ref.drug_id).toBeTruthy();
      }
    }
  });

  it('states each compared value in the quote that backs it', () => {
    for (const ref of doc.references) {
      if (ref.cmax_mg_per_l != null) {
        expect(quoteStates(ref.source_quote ?? '', ref.cmax_mg_per_l), ref.drug_id).toBe(true);
      }
      if (ref.tmax_h != null) {
        expect(quoteStates(ref.tmax_quote ?? '', ref.tmax_h), ref.drug_id).toBe(true);
      }
    }
  });

  it('keeps a row with no published reference empty', () => {
    for (const ref of doc.references) {
      if (ref.kind !== 'no published reference') continue;
      expect(ref.cmax_mg_per_l, ref.drug_id).toBeNull();
      expect(ref.tmax_h, ref.drug_id).toBeNull();
      expect(ref.source_quote, ref.drug_id).toBeNull();
    }
  });

  it('keeps a replaced comparator, with the reason it was withdrawn', () => {
    for (const ref of doc.references) {
      if (ref.withdrawn_tmax == null) continue;
      expect(ref.withdrawn_tmax.value, ref.drug_id).toBeGreaterThan(0);
      expect(ref.withdrawn_tmax.source.length, ref.drug_id).toBeGreaterThan(10);
      expect(ref.withdrawn_tmax.reason.length, ref.drug_id).toBeGreaterThan(20);
      // The withdrawn value must not also be the live comparator.
      expect(ref.withdrawn_tmax.value, ref.drug_id).not.toBe(ref.tmax_h);
    }
  });
});

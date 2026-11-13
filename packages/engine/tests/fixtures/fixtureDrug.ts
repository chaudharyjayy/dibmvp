import { Drug } from '../../types';

/**
 * TEST FIXTURE — synthetic drug with clearly labelled placeholder numbers so
 * tests pass before any real parameter exists. These are NOT real
 * pharmacology and must never be copied into data/drugs.json.
 */
export const fixtureDrug: Drug = {
  id: 'fixture-drug',
  name: 'Test Fixture Drug',
  route: 'oral',
  model: 'one-compartment',
  ka_per_h: 1.0, // TEST FIXTURE value (1/h)
  F: 1.0, // TEST FIXTURE value
  V_L_per_kg: 5.0, // TEST FIXTURE value (L/kg)
  CL_L_per_h_per_kg: 0.7, // TEST FIXTURE value (L/h/kg) -> ke = CL/V = 0.14 /h
  studied_dose_range_mg: [0, 500],
  sources: [],
  notes: 'TEST FIXTURE ONLY — placeholder parameters, not sourced',
};

/** A second fixture with ka ≈ ke to exercise the no-division-by-zero closed form. */
export const fixtureDrugEqualRates: Drug = {
  id: 'fixture-drug-equal',
  name: 'Test Fixture Drug (ka = ke)',
  route: 'oral',
  model: 'one-compartment',
  ka_per_h: 0.14, // TEST FIXTURE value
  F: 1.0, // TEST FIXTURE value
  V_L_per_kg: 5.0, // TEST FIXTURE value
  CL_L_per_h_per_kg: 0.7, // TEST FIXTURE value -> ke = 0.14 /h == ka
  studied_dose_range_mg: [0, 500],
  sources: [],
  notes: 'TEST FIXTURE ONLY — placeholder parameters, not sourced',
};

import { describe, it, expect } from 'vitest';
import {
  buildCatalog,
  normalizeName,
  slugify,
  productSourceUrl,
  type NdcProduct,
} from '../data/lib/catalog';
import { parseCsv, toObjects, validatePkRow, derivePkStatus, type PkCsvRow } from '../data/lib/pk';

const product = (over: Partial<NdcProduct>): NdcProduct => ({
  product_ndc: '0000-0001',
  generic_name: 'Example Ingredient',
  brand_name: 'Example Brand',
  labeler_name: 'Example Labs',
  dosage_form: 'TABLET',
  route: ['ORAL'],
  product_type: 'HUMAN PRESCRIPTION DRUG',
  active_ingredients: [{ name: 'EXAMPLE INGREDIENT', strength: '10 mg' }],
  ...over,
});

describe('catalog normalisation', () => {
  it('collapses case and whitespace, and slugs deterministically', () => {
    expect(normalizeName('  Example   INGREDIENT ')).toBe('example ingredient');
    expect(slugify('Example Ingredient')).toBe('example-ingredient');
    expect(slugify('  Sotalol HCl (Racemic) ')).toBe('sotalol-hcl-racemic');
  });

  it('groups products under one ingredient row', () => {
    const { drugs, stats } = buildCatalog([
      product({ product_ndc: '1-1', generic_name: 'Example Ingredient' }),
      product({ product_ndc: '2-2', generic_name: 'example   ingredient ' }),
    ]);
    expect(drugs).toHaveLength(1);
    expect(drugs[0].id).toBe('example ingredient');
    expect(drugs[0].product_count).toBe(2);
    expect(stats.ingredients).toBe(1);
  });

  it('keeps the most common spelling as the display name', () => {
    const { drugs } = buildCatalog([
      product({ product_ndc: '1', generic_name: 'Example Ingredient' }),
      product({ product_ndc: '2', generic_name: 'Example Ingredient' }),
      product({ product_ndc: '3', generic_name: 'Example ingredient' }),
    ]);
    expect(drugs[0].name).toBe('Example Ingredient');
  });

  it('links a combination product to every ingredient and counts it', () => {
    const { drugs, products, stats } = buildCatalog([
      product({
        product_ndc: '9-9',
        generic_name: 'Combo Product',
        active_ingredients: [
          { name: 'Ingredient A', strength: '1 mg' },
          { name: 'Ingredient B', strength: '2 mg' },
        ],
      }),
    ]);
    expect(products[0].drug_ids).toHaveLength(2);
    expect(stats.combinationProducts).toBe(1);
    const a = drugs.find((d) => d.normalized_name === 'ingredient a');
    expect(a?.combination_product_count).toBe(1);
  });

  it('uses the normalized name as a stable id, so punctuation variants cannot collide', () => {
    const { drugs } = buildCatalog([
      product({
        product_ndc: '1',
        generic_name: 'Vitamin B12',
        active_ingredients: [{ name: 'Vitamin B12', strength: '1 mg' }],
      }),
      product({
        product_ndc: '2',
        generic_name: 'Vitamin-B12',
        active_ingredients: [{ name: 'Vitamin-B12', strength: '1 mg' }],
      }),
    ]);
    expect(drugs.map((d) => d.id).sort()).toEqual(['vitamin b12', 'vitamin-b12']);
  });

  it('never uses a combination product name as an ingredient name', () => {
    const { drugs } = buildCatalog([
      product({
        product_ndc: '1',
        generic_name: 'Aspirin and Caffeine',
        active_ingredients: [
          { name: 'ASPIRIN', strength: '300 mg' },
          { name: 'CAFFEINE', strength: '30 mg' },
        ],
      }),
    ]);
    expect(drugs.map((d) => d.name).sort()).toEqual(['Aspirin', 'Caffeine']);
  });

  it('title-cases all-caps names, including ones that start with punctuation', () => {
    const { drugs } = buildCatalog([
      product({
        product_ndc: '1',
        generic_name: 'BUPIVACAINE HYDROCHLORIDE',
        active_ingredients: [{ name: 'BUPIVACAINE HYDROCHLORIDE', strength: '2.5 mg/mL' }],
      }),
      product({
        product_ndc: '2',
        generic_name: '.ALPHA.-KETOGLUTARIC ACID',
        active_ingredients: [{ name: '.ALPHA.-KETOGLUTARIC ACID', strength: '1 mg' }],
      }),
      product({
        product_ndc: '3',
        generic_name: 'Bupivacaine HCl',
        active_ingredients: [{ name: 'Bupivacaine HCl', strength: '5 mg/mL' }],
      }),
    ]);
    expect(drugs.map((d) => d.name).sort()).toEqual([
      '.Alpha.-Ketoglutaric Acid',
      'Bupivacaine HCl',
      'Bupivacaine Hydrochloride',
    ]);
  });

  it('collapses duplicate NDC rows and reports the count', () => {
    const { products, stats } = buildCatalog([
      product({ product_ndc: '1-1' }),
      product({ product_ndc: '1-1' }),
    ]);
    expect(products).toHaveLength(1);
    expect(stats.duplicateProducts).toBe(1);
  });

  it('skips records that carry no active ingredient and records the count', () => {
    const { products, stats } = buildCatalog([
      product({ product_ndc: '1' }),
      { product_ndc: '2', active_ingredients: [] },
    ]);
    expect(products).toHaveLength(1);
    expect(stats.skippedNoIngredients).toBe(1);
  });

  it('marks a drug oral when any of its products is oral', () => {
    const { stats } = buildCatalog([
      product({ product_ndc: '1', route: ['TOPICAL'], dosage_form: 'CREAM' }),
      product({ product_ndc: '2', route: ['ORAL'], dosage_form: 'TABLET' }),
    ]);
    expect(stats.oralIngredients).toBe(1);
  });

  it('keeps a traceable source URL per product', () => {
    expect(productSourceUrl('0002-4462')).toBe(
      'https://api.fda.gov/drug/ndc.json?search=product_ndc:%220002-4462%22'
    );
  });
});

describe('pk review format', () => {
  const header = [
    'drug_id',
    'route',
    'ka_per_h',
    'f_bioavailability',
    'cl_l_per_h_per_kg',
    'v_l_per_kg',
    'dose_min_mg',
    'dose_max_mg',
    'source_url',
    'source_quote',
    'source_title',
    'reviewer',
    'reviewed_at',
    'status',
    'notes',
  ].join(',');

  const row = (over: Partial<PkCsvRow> = {}): PkCsvRow => ({
    drug_id: 'example-ingredient',
    route: 'oral',
    ka_per_h: '1.2',
    f_bioavailability: '0.9',
    cl_l_per_h_per_kg: '0.3',
    v_l_per_kg: '1.0',
    dose_min_mg: '100',
    dose_max_mg: '1000',
    source_url: 'https://example.org/label.pdf',
    source_quote:
      'Following oral administration the mean bioavailability was 90% and clearance 0.3 L/h/kg.',
    source_title: 'Example label, Clinical Pharmacology',
    reviewer: 'J. Reviewer',
    reviewed_at: '2026-11-10',
    status: 'approved',
    notes: '',
    ...over,
  });

  it('parses quoted commas and escaped quotes', () => {
    const csv = `${header}\n"a,b","oral",1,1,1,1,1,1,"https://x.org","He said ""fine"", then, ok",t,r,2026-01-01,approved,n\n`;
    const [obj] = toObjects(parseCsv(csv));
    expect(obj.drug_id).toBe('a,b');
    expect(obj.source_quote).toBe('He said "fine", then, ok');
  });

  it('accepts a complete, cited row', () => {
    const { values, errors } = validatePkRow(row());
    expect(errors).toEqual([]);
    expect(values?.ka_per_h).toBe(1.2);
    expect(values?.status).toBe('approved');
  });

  it('refuses a row without a quoted source', () => {
    const { errors } = validatePkRow(row({ source_quote: 'label says so' }));
    expect(errors.join(' ')).toMatch(/source_quote/);
  });

  it('refuses a row without a full source URL', () => {
    const { errors } = validatePkRow(row({ source_url: 'www.example.org' }));
    expect(errors.join(' ')).toMatch(/source_url/);
  });

  it('refuses an approved row missing a reviewer or a parameter', () => {
    expect(validatePkRow(row({ reviewer: '' })).errors.join(' ')).toMatch(/reviewer/);
    expect(validatePkRow(row({ v_l_per_kg: '' })).errors.join(' ')).toMatch(/v_l_per_kg/);
  });

  it('refuses implausible values and an inverted dose range', () => {
    expect(validatePkRow(row({ f_bioavailability: '1.4' })).errors.join(' ')).toMatch(
      /f_bioavailability/
    );
    expect(validatePkRow(row({ dose_min_mg: '900', dose_max_mg: '100' })).errors.join(' ')).toMatch(
      /greater than dose_max_mg/
    );
    expect(validatePkRow(row({ ka_per_h: 'not-a-number' })).errors.join(' ')).toMatch(/not a number/);
  });

  it('refuses a route the engine cannot simulate', () => {
    const { errors } = validatePkRow(row({ route: 'intravenous' }));
    expect(errors.join(' ')).toMatch(/only oral/);
  });

  it('allows a pending row with missing numbers but never marks it reviewed', () => {
    const { values, errors } = validatePkRow(
      row({ status: 'pending', ka_per_h: '', f_bioavailability: '', cl_l_per_h_per_kg: '', v_l_per_kg: '' })
    );
    expect(errors).toEqual([]);
    expect(derivePkStatus([values!])).toBe('partial');
  });

  it('marks a drug reviewed only when all four parameters are approved', () => {
    const { values } = validatePkRow(row());
    expect(derivePkStatus([values!])).toBe('reviewed');
    expect(derivePkStatus([])).toBe('unsourced');
  });
});

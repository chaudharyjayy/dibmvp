/**
 * The per-parameter citation file (data/pk-parameters.csv).
 *
 * data/pk-review.csv holds one row per drug: its four parameters, its dose
 * range and one document. That is enough to say where the row came from, but
 * not enough to say which document backs *which* number — and the numbers do
 * not all come from the same place. This file holds one row per parameter, so
 * every value can point at the sentence that states it.
 *
 * The columns are deliberately flat: a reviewer reads them in a spreadsheet
 * and pastes them in without thinking about JSON.
 */

export interface PkParameterCsvRow {
  drug_id: string;
  parameter: string;
  value: string;
  source_url: string;
  source_quote: string;
  source_title: string;
  source_kind: string;
  population: string;
  route: string;
  reviewed_by: string;
  reviewed_at: string;
}

export const PK_PARAMETER_COLUMNS: (keyof PkParameterCsvRow)[] = [
  'drug_id',
  'parameter',
  'value',
  'source_url',
  'source_quote',
  'source_title',
  'source_kind',
  'population',
  'route',
  'reviewed_by',
  'reviewed_at',
];

/** The parameters a citation row may describe. */
export const PK_PARAMETER_NAMES = [
  'ka_per_h',
  'f_bioavailability',
  'cl_l_per_h_per_kg',
  'v_l_per_kg',
  'dose_min_mg',
  'dose_max_mg',
  't_half_h',
  't_max_h',
] as const;

export type PkParameterName = (typeof PK_PARAMETER_NAMES)[number];

export type PkParameterValue = {
  drug_id: string;
  parameter: PkParameterName;
  value: number | null;
  source_url: string;
  source_quote: string;
  source_title: string | null;
  source_kind: 'label' | 'bookshelf' | 'pkdb' | 'paper' | 'other';
  population: string | null;
  route: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

/**
 * Build objects from the parameter file's own header. The review file has a
 * different set of columns, so it needs its own reader rather than the one
 * that checks for ka, F, CL and V.
 */
export function toParameterObjects(rows: string[][]): PkParameterCsvRow[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const missing = PK_PARAMETER_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(`pk-parameters.csv is missing columns: ${missing.join(', ')}`);
  }
  return rows.slice(1).map((cells) => {
    const out = {} as PkParameterCsvRow;
    for (const col of PK_PARAMETER_COLUMNS) {
      out[col] = (cells[header.indexOf(col)] ?? '').trim();
    }
    return out;
  });
}

/** Validate one citation row. Returns the DB-ready value or the reasons. */
export function validatePkParameterRow(row: PkParameterCsvRow): {
  values?: PkParameterValue;
  errors: string[];
} {
  const errors: string[] = [];

  if (!row.drug_id) errors.push('drug_id is empty');
  if (!PK_PARAMETER_NAMES.includes(row.parameter as PkParameterName)) {
    errors.push(
      `parameter "${row.parameter}" is not one of ${PK_PARAMETER_NAMES.join(', ')}`
    );
  }
  if (!/^https?:\/\/\S+$/i.test(row.source_url) || row.source_url.length < 12) {
    errors.push('source_url must be a full http(s) URL');
  }
  if (row.source_quote.length < 40) {
    errors.push('source_quote must be the sentence that states this value');
  }
  const kind = row.source_kind.trim().toLowerCase();
  if (kind && !['label', 'bookshelf', 'pkdb', 'paper', 'other'].includes(kind)) {
    errors.push(`source_kind "${row.source_kind}" is not recognised`);
  }

  const raw = row.value.trim();
  const parsed = raw === '' ? null : Number(raw);
  if (raw !== '' && !Number.isFinite(parsed)) errors.push('value is not a number');

  const values: PkParameterValue = {
    drug_id: row.drug_id.trim(),
    parameter: row.parameter as PkParameterName,
    value: parsed,
    source_url: row.source_url.trim(),
    source_quote: row.source_quote.trim(),
    source_title: row.source_title.trim() || null,
    source_kind: (kind || 'other') as PkParameterValue['source_kind'],
    population: row.population.trim() || null,
    route: row.route.trim() || null,
    reviewed_by: row.reviewed_by.trim() || null,
    reviewed_at: row.reviewed_at.trim() || null,
  };

  return errors.length > 0 ? { errors } : { values, errors };
}

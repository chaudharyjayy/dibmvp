/**
 * Pure helpers for the PK review file (data/pk-review.csv).
 *
 * A row is only importable when it carries the citation it came from. That is
 * the whole point of this file: the project never emits a pharmacokinetic
 * number that cannot be traced to a quoted sentence.
 */

export interface PkCsvRow {
  drug_id: string;
  route: string;
  ka_per_h: string;
  f_bioavailability: string;
  cl_l_per_h_per_kg: string;
  v_l_per_kg: string;
  dose_min_mg: string;
  dose_max_mg: string;
  source_url: string;
  source_quote: string;
  source_title: string;
  reviewer: string;
  reviewed_at: string;
  status: string;
  notes: string;
}

export const PK_COLUMNS: (keyof PkCsvRow)[] = [
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
];

/** Minimal RFC4180 parser: quoted fields, `""` escapes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field.length === 0) {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

export function toObjects(rows: string[][]): PkCsvRow[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const missing = PK_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(`pk-review.csv is missing columns: ${missing.join(', ')}`);
  }
  return rows.slice(1).map((cells) => {
    const out = {} as PkCsvRow;
    for (const col of PK_COLUMNS) {
      out[col] = (cells[header.indexOf(col)] ?? '').trim();
    }
    return out;
  });
}

export interface PkValues {
  drug_id: string;
  route: string;
  ka_per_h: number | null;
  f_bioavailability: number | null;
  cl_l_per_h_per_kg: number | null;
  v_l_per_kg: number | null;
  dose_min_mg: number | null;
  dose_max_mg: number | null;
  source_url: string;
  source_quote: string;
  source_title: string | null;
  reviewer: string | null;
  reviewed_at: string | null;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
}

const num = (raw: string): number | null => {
  if (raw === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : NaN;
};

const inRange = (v: number | null, min: number, max: number) =>
  v !== null && Number.isFinite(v) && v >= min && v <= max;

/** Reject 2026-02-31 style dates, not just malformed strings. */
const isIsoDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Validate one row. Returns the DB-ready values, or the reasons it cannot be
 * imported (all reasons, so one pass fixes everything).
 */
export function validatePkRow(
  row: PkCsvRow
): { values?: PkValues; errors: string[] } {
  const errors: string[] = [];
  const status = row.status as PkValues['status'];

  if (!row.drug_id) errors.push('drug_id is empty');
  const route = row.route.trim().toLowerCase();
  if (route !== 'oral') {
    errors.push(`route "${row.route}" is not supported — only oral is simulated today`);
  }
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    errors.push('status must be pending, approved or rejected');
  }
  if (!/^https?:\/\/\S+$/i.test(row.source_url) || row.source_url.length < 12) {
    errors.push('source_url must be a full http(s) URL');
  }
  if (row.source_quote.length < 40) {
    errors.push('source_quote must be the cited sentence (at least 40 characters)');
  }

  const values: PkValues = {
    drug_id: row.drug_id,
    route,
    ka_per_h: num(row.ka_per_h),
    f_bioavailability: num(row.f_bioavailability),
    cl_l_per_h_per_kg: num(row.cl_l_per_h_per_kg),
    v_l_per_kg: num(row.v_l_per_kg),
    dose_min_mg: num(row.dose_min_mg),
    dose_max_mg: num(row.dose_max_mg),
    source_url: row.source_url,
    source_quote: row.source_quote,
    source_title: row.source_title || null,
    reviewer: row.reviewer || null,
    reviewed_at: row.reviewed_at || null,
    status: status === 'approved' || status === 'rejected' ? status : 'pending',
    notes: row.notes || null,
  };

  for (const [field, value] of Object.entries(values)) {
    if (typeof value === 'number' && Number.isNaN(value)) {
      errors.push(`${field} is not a number`);
    }
  }
  if (values.ka_per_h !== null && !inRange(values.ka_per_h, 0.0001, 50)) {
    errors.push('ka_per_h must be between 0.0001 and 50 /h');
  }
  if (values.f_bioavailability !== null && !inRange(values.f_bioavailability, 0.0001, 1)) {
    errors.push('f_bioavailability must be in (0, 1]');
  }
  if (
    values.cl_l_per_h_per_kg !== null &&
    !(Number.isFinite(values.cl_l_per_h_per_kg) && values.cl_l_per_h_per_kg > 0 && values.cl_l_per_h_per_kg <= 10)
  ) {
    errors.push('cl_l_per_h_per_kg must be greater than 0 and at most 10 L/h/kg');
  }
  if (
    values.v_l_per_kg !== null &&
    !(Number.isFinite(values.v_l_per_kg) && values.v_l_per_kg > 0.01 && values.v_l_per_kg <= 100)
  ) {
    errors.push('v_l_per_kg must be greater than 0.01 and at most 100 L/kg');
  }
  if (values.dose_min_mg !== null && !inRange(values.dose_min_mg, 0.0001, 100_000)) {
    errors.push('dose_min_mg is out of range');
  }
  if (values.dose_max_mg !== null && !inRange(values.dose_max_mg, 0.0001, 100_000)) {
    errors.push('dose_max_mg is out of range');
  }
  if (values.dose_min_mg !== null && values.dose_max_mg !== null &&
      values.dose_min_mg > values.dose_max_mg) {
    errors.push('dose_min_mg is greater than dose_max_mg');
  }

  if (values.status === 'approved') {
    for (const field of ['ka_per_h', 'f_bioavailability', 'cl_l_per_h_per_kg', 'v_l_per_kg'] as const) {
      if (values[field] === null) errors.push(`approved rows need ${field}`);
    }
    if (values.dose_min_mg === null || values.dose_max_mg === null) {
      errors.push('approved rows need dose_min_mg and dose_max_mg');
    }
    if (!values.reviewer) errors.push('approved rows need a reviewer name');
    if (!values.reviewed_at || !isIsoDate(values.reviewed_at)) {
      errors.push('approved rows need a real reviewed_at date (YYYY-MM-DD)');
    }
  }

  return errors.length > 0 ? { errors } : { values, errors };
}

/** pk_status for a drug after import, from its rows. */
export function derivePkStatus(
  rows: Array<Pick<PkValues, 'status' | 'ka_per_h' | 'f_bioavailability' | 'cl_l_per_h_per_kg' | 'v_l_per_kg'>>
): 'unsourced' | 'partial' | 'reviewed' {
  if (rows.length === 0) return 'unsourced';
  const approved = rows.filter((r) => r.status === 'approved');
  const complete = approved.some(
    (r) =>
      r.ka_per_h !== null &&
      r.f_bioavailability !== null &&
      r.cl_l_per_h_per_kg !== null &&
      r.v_l_per_kg !== null
  );
  return complete ? 'reviewed' : 'partial';
}

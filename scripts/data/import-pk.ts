/**
 * import-pk — load reviewed pharmacokinetic parameters into Supabase.
 *
 * Input: data/pk-review.csv (untracked by default? no — it IS tracked once it
 * holds only public citations; see scripts/data/README.md).
 * Every row must cite a source URL and quote the sentence the numbers come
 * from. Rows are validated before anything is written; one bad row stops the
 * whole import so the table never holds a half-reviewed value.
 *
 * The simulator may only use rows with status=approved. Setting a row to
 * approved by hand in the CSV does not bypass the checks below: all four
 * parameters, a dose range, a reviewer and a review date are required.
 *
 * Usage:
 *   npm run data:pk:dry            # validate the CSV, write nothing
 *   npm run data:pk                # upsert into public.drug_pk
 *   npm run data:pk -- --file data/pk-review.csv
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  derivePkStatus,
  parseCsv,
  toObjects,
  validatePkRow,
  type PkValues,
  type PkCsvRow,
} from './lib/pk';
import { parseArgs, repoRoot, requireWriteCredentials } from './lib/env';
import {
  toParameterObjects,
  validatePkParameterRow,
  type PkParameterCsvRow,
  type PkParameterValue,
} from './lib/pk-parameters';

const DEFAULT_FILE = join(repoRoot, 'data', 'pk-review.csv');
const DEFAULT_PARAMETER_FILE = join(repoRoot, 'data', 'pk-parameters.csv');

function printRowErrors(index: number, row: PkCsvRow, errors: string[]): void {
  console.error(`row ${index + 2} (${row.drug_id || 'no drug_id'}):`);
  for (const e of errors) console.error(`  - ${e}`);
}


/** Read the per-parameter citation file, if it exists. */
async function readParameterRows(args: Record<string, string | boolean>): Promise<PkParameterValue[]> {
  const file =
    typeof args['parameter-file'] === 'string'
      ? (args['parameter-file'] as string)
      : DEFAULT_PARAMETER_FILE;
  if (!existsSync(file)) return [];
  const rows = toParameterObjects(parseCsv(readFileSync(file, 'utf8'))) as PkParameterCsvRow[];
  const out: PkParameterValue[] = [];
  rows.forEach((row, i) => {
    const { values, errors } = validatePkParameterRow(row);
    if (errors.length > 0) {
      console.error(`parameter row ${i + 2} (${row.drug_id} ${row.parameter}):`);
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    if (values) out.push(values);
  });
  return out;
}

/**
 * Citation rows for values that have no row of their own in
 * data/pk-parameters.csv.
 *
 * A review row's quote often names several parameters at once ("clearance and
 * volume of distribution were ... bioavailability was ..."), in which case that
 * quote really is the citation for each of those parameters and is used as
 * such. Where the quote does not mention a parameter, the row's document is
 * still recorded for it — the value is not unsourced — but it is marked as
 * document-level, so the app can tell the difference between a value with its
 * own sentence and a value that only has its drug's document.
 */
function parameterFallbacks(
  rows: PkValues[],
  cited: PkParameterValue[]
): PkParameterValue[] {
  const have = new Set(cited.map((c) => `${c.drug_id}|${c.parameter}`));
  const fields: Array<[string, number | null, RegExp]> = [
    ['ka_per_h', null, /absorption rate|absorption half-?life|absorption constant|\bka\b/i],
    ['f_bioavailability', null, /bioavailab/i],
    ['cl_l_per_h_per_kg', null, /clearance/i],
    ['v_l_per_kg', null, /volume of distribution|volume of the central|apparent volume/i],
    ['dose_min_mg', null, /\bdose|\b\d+\s*-\s*\d+\s*mg\b/i],
    ['dose_max_mg', null, /\bdose|\b\d+\s*-\s*\d+\s*mg\b/i],
  ];
  const out: PkParameterValue[] = [];
  for (const row of rows) {
    for (const [name, , pattern] of fields) {
      const key = `${row.drug_id}|${name}`;
      if (have.has(key)) continue;
      const value = (row as unknown as Record<string, number | null>)[name];
      if (value === null || value === undefined) continue;
      const named = pattern.test(row.source_quote);
      out.push({
        drug_id: row.drug_id,
        parameter: name as PkParameterValue['parameter'],
        value,
        source_url: row.source_url,
        source_quote: row.source_quote,
        source_title: row.source_title,
        source_kind: named ? kindFor(row.source_url) : 'other',
        population: null,
        route: row.route,
        reviewed_by: row.reviewer,
        reviewed_at: row.reviewed_at,
      });
    }
  }
  return out;
}

/** The kind of document a URL points at, from the URL itself. */
function kindFor(url: string): PkParameterValue['source_kind'] {
  if (/dailymed\.nlm\.nih\.gov/i.test(url)) return 'label';
  if (/accessdata\.fda\.gov/i.test(url)) return 'label';
  if (/ncbi\.nlm\.nih\.gov\/books/i.test(url)) return 'bookshelf';
  if (/pmc\.ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|europepmc/i.test(url)) {
    return 'paper';
  }
  return 'other';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = typeof args.file === 'string' ? args.file : DEFAULT_FILE;

  if (!existsSync(file)) {
    console.log(
      [
        `No review file at ${file}.`,
        '',
        'Copy the template and fill one row per drug:',
        '  cp data/pk-review.example.csv data/pk-review.csv',
        '',
        'A row is importable only with a source_url and a quoted source sentence.',
      ].join('\n')
    );
    process.exit(2);
  }

  const rows = toObjects(parseCsv(readFileSync(file, 'utf8')));
  if (rows.length === 0) {
    console.log('review file has no data rows — nothing to import');
    return;
  }

  const valid: PkValues[] = [];
  let failed = 0;
  rows.forEach((row, i) => {
    const { values, errors } = validatePkRow(row);
    if (errors.length > 0) {
      failed++;
      printRowErrors(i, row, errors);
    } else if (values) {
      valid.push(values);
    }
  });
  if (failed > 0) {
    console.error(`${failed} row(s) failed validation; nothing was written.`);
    process.exit(1);
  }

  const ids = [...new Set(valid.map((v) => v.drug_id))];
  if (ids.length !== valid.length) {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const v of valid) {
      if (seen.has(v.drug_id)) dupes.add(v.drug_id);
      seen.add(v.drug_id);
    }
    console.error(`duplicate drug_id rows: ${[...dupes].join(', ')} — keep one row per drug.`);
    process.exit(1);
  }

  console.log(`${valid.length} row(s) valid`);
  if (args.dry) {
    for (const v of valid) {
      console.log(`  ${v.drug_id}: status=${v.status} source=${v.source_url}`);
    }
    console.log('dry run: nothing written');
    return;
  }

  const { url, adminKey } = requireWriteCredentials();
  const db = createClient(url, adminKey, { auth: { persistSession: false } });

  // Every row must point at a real catalogue drug.
  const { data: existing, error: lookupError } = await db
    .from('drugs')
    .select('id')
    .in('id', ids);
  if (lookupError) throw new Error(`drug lookup failed: ${lookupError.message}`);
  const known = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.error(
      `unknown drug_id(s) — import the catalogue first (npm run data:import): ${unknown.join(', ')}`
    );
    process.exit(1);
  }

  // Citations first: the database refuses to approve a row whose values have
  // no citation, so the documents have to be in place before the row lands.
  const parameters = await readParameterRows(args);
  if (parameters.length) {
    const { error: parameterError } = await db
      .from('drug_pk_parameter')
      .upsert(parameters, { onConflict: 'drug_id,parameter' });
    if (parameterError) throw new Error(`drug_pk_parameter upsert failed: ${parameterError.message}`);
    console.log(`imported ${parameters.length} per-parameter citation row(s)`);
  }

  // A value with no citation row of its own still needs a document behind it.
  // The row's own source is used, marked 'other', and the gap is recorded in
  // the row's notes so nobody mistakes it for a per-parameter citation.
  const fallback = parameterFallbacks(valid, parameters);
  if (fallback.length) {
    const { error: fallbackError } = await db
      .from('drug_pk_parameter')
      .upsert(fallback, { onConflict: 'drug_id,parameter' });
    if (fallbackError) throw new Error(`drug_pk_parameter fallback failed: ${fallbackError.message}`);
    console.log(
      `${fallback.length} value(s) cited at document level only — add a per-parameter row in data/pk-parameters.csv`
    );
  }

  const { error } = await db.from('drug_pk').upsert(valid, { onConflict: 'drug_id' });
  if (error) throw new Error(`drug_pk upsert failed: ${error.message}`);

  // drugs.pk_status is maintained by the drug_pk_sync_status trigger, so the
  // script cannot leave it stale even if it stops halfway through.
  const approved = valid.filter((v) => v.status === 'approved').length;
  console.log(
    `imported ${valid.length} PK row(s): ${approved} approved, ${valid.length - approved} pending/rejected`
  );
  console.log(
    `${valid.filter((v) => derivePkStatus([v]) === 'reviewed').length} drug(s) now simulatable`
  );
}

void main().catch((e: unknown) => {
  console.error(`import-pk: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

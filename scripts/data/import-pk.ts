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

const DEFAULT_FILE = join(repoRoot, 'data', 'pk-review.csv');

function printRowErrors(index: number, row: PkCsvRow, errors: string[]): void {
  console.error(`row ${index + 2} (${row.drug_id || 'no drug_id'}):`);
  for (const e of errors) console.error(`  - ${e}`);
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

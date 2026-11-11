/**
 * withdraw-unverified-pk — demote PK rows whose citation does not resolve.
 *
 * The table is supposed to be provenance-gated: an approved row carries a
 * source URL and the sentence the numbers came from. That gate stops a
 * half-reviewed value reaching the simulator, but it cannot tell whether the
 * citation itself exists. A row whose source URL 404s is not reviewed, it is
 * invented, and it must not stay approved.
 *
 * This script checks each row's source URL and demotes the ones that do not
 * resolve, recording what happened in the notes column. It never approves
 * anything and never deletes a row: the history stays visible.
 *
 * Usage:
 *   npm run data:pk:verify            # report only, writes nothing
 *   npm run data:pk:verify -- --apply # demote the rows that do not resolve
 */
import { createClient } from '@supabase/supabase-js';
import { parseArgs, requireWriteCredentials } from './lib/env';
import { supportsQuote } from './lib/citation';

type PkRow = {
  drug_id: string;
  status: string;
  source_url: string;
  source_quote: string;
  reviewer: string | null;
  notes: string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true || args.apply === 'true';

  const { url, adminKey } = requireWriteCredentials();
  const db = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await db.from('drug_pk').select('*');
  if (error) {
    console.error(`could not read drug_pk: ${error.message}`);
    process.exit(1);
  }
  const rows = (data ?? []) as PkRow[];
  if (!rows.length) {
    console.log('drug_pk is empty — nothing to check.');
    return;
  }

  let demoted = 0;
  for (const row of rows) {
    const check = await supportsQuote(row.source_url, row.source_quote ?? '');
    console.log(
      `${row.drug_id}: status=${row.status} — ${check.ok ? 'citation supports the quote' : `UNSUPPORTED: ${check.why}`}`
    );
    console.log(`    ${row.source_url}`);
    if (check.ok || row.status !== 'approved') continue;
    demoted += 1;
    if (!apply) continue;
    const note = [
      'demoted by scripts/data/withdraw-unverified-pk.ts',
      `${check.why} on ${new Date().toISOString().slice(0, 10)}`,
      row.notes ?? '',
    ]
      .filter(Boolean)
      .join('; ');
    const { error: updateError } = await db
      .from('drug_pk')
      .update({ status: 'pending', reviewer: null, notes: note })
      .eq('drug_id', row.drug_id);
    if (updateError) console.error(`  failed to demote ${row.drug_id}: ${updateError.message}`);
    else console.log(`  demoted ${row.drug_id} to pending`);
  }

  if (!apply) {
    console.log(`\n${demoted} approved row(s) would be demoted. Re-run with --apply to do it.`);
    return;
  }
  console.log(`\ndemoted ${demoted} row(s).`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

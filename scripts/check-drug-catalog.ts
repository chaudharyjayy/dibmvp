/**
 * check:drugs — verifies the live catalogue using only the PUBLIC anon key.
 *
 * Proves, without any privileged credential:
 *   a. the catalogue tables exist and are readable
 *   b. counts match the openFDA snapshot (~138k products, ~7.6k ingredients)
 *   c. search_drugs returns ranked matches for a real ingredient
 *   d. anon cannot write to the catalogue
 *   e. drug_pk itself is not exposed; only the approved-rows view is
 *   f. every exposed PK row has a source URL, a quoted sentence and all four
 *      parameters, so nothing half-reviewed can reach the simulator
 *
 * Run: npm run check:drugs
 */
import { createClient } from '@supabase/supabase-js';
import { readRepoEnv } from './data/lib/env';

const env = readRepoEnv();
const url = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.log('SKIP: .env needs SUPABASE_URL and SUPABASE_ANON_KEY.');
  process.exit(2);
}

const db = createClient(url, anonKey, { auth: { persistSession: false } });
const checks: Array<[string, boolean, string]> = [];
const add = (name: string, ok: boolean, detail = '') => checks.push([name, ok, detail]);

async function main(): Promise<void> {
  const [drugs, products, pk, rawPk] = await Promise.all([
    db.from('drugs').select('*', { count: 'exact', head: true }),
    db.from('drug_products').select('*', { count: 'exact', head: true }),
    db.from('drug_pk_public').select('*', { count: 'exact', head: true }),
    db.from('drug_pk').select('*', { count: 'exact', head: true }),
  ]);

  add('drugs table readable', !drugs.error, drugs.error?.message ?? '');
  add('drug_products table readable', !products.error, products.error?.message ?? '');
  add('drug_pk_public view readable', !pk.error, pk.error?.message ?? '');
  // The base table must stay closed: only approved rows are public.
  add(
    'drug_pk base table is not readable by anon',
    Boolean(rawPk.error),
    'anon should read drug_pk_public instead'
  );
  add(
    `drugs rows (${drugs.count ?? 0}) >= 7000`,
    (drugs.count ?? 0) >= 7000,
    'run npm run data:import'
  );
  add(
    `drug_products rows (${products.count ?? 0}) >= 100000`,
    (products.count ?? 0) >= 100000,
    'run npm run data:import'
  );

  // Public search must work for a real ingredient.
  const search = await db.rpc('search_drugs', { q: 'metformin', lim: 5 });
  const hits = (search.data ?? []) as Array<{ id: string; name: string }>;
  add(
    `search_drugs("metformin") returns hits (${hits.length})`,
    !search.error && hits.some((h) => h.name.toLowerCase().includes('metformin')),
    search.error?.message ?? ''
  );

  // Anon must not be able to write.
  const insert = await db
    .from('drugs')
    .insert({ id: 'probe', name: 'probe', normalized_name: 'probe' });
  add('anon insert into drugs is rejected', Boolean(insert.error), 'writes must be admin-key only');
  if (!insert.error) {
    console.log('WARNING: anon insert succeeded; remove the probe row and re-check the grants.');
  }

  // Provenance and completeness of everything the simulator can read.
  const { data: pkRows, error: pkError } = await db
    .from('drug_pk_public')
    .select(
      'drug_id,source_url,source_quote,ka_per_h,f_bioavailability,cl_l_per_h_per_kg,v_l_per_kg,dose_min_mg,dose_max_mg'
    );
  if (pkError) {
    add('drug_pk_public rows readable for audit', false, pkError.message);
  } else {
    const rows = (pkRows ?? []) as Array<Record<string, unknown>>;
    const missingSource = rows.filter(
      (r) =>
        typeof r.source_url !== 'string' ||
        r.source_url.length < 12 ||
        typeof r.source_quote !== 'string' ||
        r.source_quote.length < 40
    );
    add(
      `every exposed PK row has source_url + quote (${rows.length} rows)`,
      missingSource.length === 0,
      missingSource.map((r) => String(r.drug_id)).join(', ')
    );

    const incomplete = rows.filter((r) =>
      [
        r.ka_per_h,
        r.f_bioavailability,
        r.cl_l_per_h_per_kg,
        r.v_l_per_kg,
        r.dose_min_mg,
        r.dose_max_mg,
      ].some((v) => v === null || v === undefined)
    );
    add(
      `every exposed PK row has all parameters (${rows.length} rows)`,
      incomplete.length === 0,
      incomplete.map((r) => String(r.drug_id)).join(', ')
    );
  }

  // Reviewer names and notes must not be public.
  const privateFields = await db.from('drug_pk_public').select('reviewer').limit(1);
  add(
    'drug_pk_public exposes no reviewer field',
    Boolean(privateFields.error),
    'reviewer/notes belong in the admin-only table'
  );

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${!ok && detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
  }
  console.log(failed === 0 ? 'ALL CHECKS PASS' : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.log(`FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

/**
 * refresh-pk — keep the pharmacokinetic layer current, and prove it.
 *
 * The catalogue and the PK rows live in Supabase, not in this repository, so
 * the repository's copy of the drug data has to be refreshed from them rather
 * than maintained by hand. This script does three things:
 *
 *   1. Re-verifies every citation: it fetches the document and checks that
 *      the quoted sentence is still in it. A citation that has rotted is
 *      reported, and the drug is demoted out of "reviewed" so the app stops
 *      serving a number nobody can check.
 *   2. Regenerates data/drugs.json from the approved rows, so the engine's
 *      dataset is a mirror of the database instead of a hand-edited file.
 *   3. With --deep, re-pulls the FDA labels and re-extracts candidates, so a
 *      label revision or a new label is noticed rather than missed.
 *
 * The light pass is a handful of HTTP requests and is meant to run daily. The
 * deep pass hits openFDA's rate limit (1,000 requests a day without a key)
 * and is meant to run weekly.
 *
 * Usage:
 *   npm run data:refresh              # verify citations, regenerate drugs.json
 *   npm run data:refresh -- --deep    # also re-fetch labels and re-extract
 *   npm run data:refresh -- --apply   # demote drugs whose citation failed
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { supportsQuote } from './lib/citation';
import { parseArgs, readRepoEnv, repoRoot } from './lib/env';

type PkRow = {
  drug_id: string;
  status: string;
  ka_per_h: number | null;
  f_bioavailability: number | null;
  cl_l_per_h_per_kg: number | null;
  v_l_per_kg: number | null;
  dose_min_mg: number | null;
  dose_max_mg: number | null;
  route: string;
  source_url: string;
  source_quote: string;
  source_title: string | null;
  notes: string | null;
};

type ParameterRow = {
  drug_id: string;
  parameter: string;
  value: number | null;
  source_url: string;
  source_quote: string;
  source_title: string | null;
  source_kind: string | null;
  population: string | null;
  route: string | null;
};

type DrugRow = { id: string; name: string; routes: string[] };

/** The order the engine's short list prefers: our three first. */
const PREFERRED = ['caffeine', 'acetaminophen', 'ibuprofen'];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true || args.apply === 'true';
  const deep = args.deep === true || args.deep === 'true';

  const env = readRepoEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.log('SKIP: .env needs SUPABASE_URL and SUPABASE_ANON_KEY.');
    process.exit(2);
  }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // The public role may not select every column of drug_pk (reviewer and
  // notes are withheld on purpose), and the catalogue is paged: PostgREST
  // returns at most 1,000 rows a request.
  const { data: rows, error: rowsError } = await db
    .from('drug_pk')
    .select(
      'drug_id,status,ka_per_h,f_bioavailability,cl_l_per_h_per_kg,v_l_per_kg,dose_min_mg,dose_max_mg,route,source_url,source_quote,source_title'
    )
    .order('drug_id');
  if (rowsError) throw new Error(`drug_pk read failed: ${rowsError.message}`);

  const { data: params, error: paramsError } = await db
    .from('drug_pk_citations')
    .select('drug_id,parameter,value,source_url,source_quote,source_title,source_kind,population,route');
  if (paramsError) throw new Error(`drug_pk_citations read failed: ${paramsError.message}`);

  const catalogue: DrugRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await db
      .from('drugs')
      .select('id,name,routes')
      .range(from, from + 999);
    if (error) throw new Error(`drugs read failed: ${error.message}`);
    catalogue.push(...((page ?? []) as DrugRow[]));
    if (!page || page.length < 1000) break;
  }

  const pkRows = (rows ?? []) as PkRow[];
  const parameterRows = (params ?? []) as ParameterRow[];
  console.log(
    `database: ${pkRows.length} PK row(s), ${parameterRows.length} citation row(s), ${catalogue.length} catalogue drug(s)`
  );

  /* 1. Re-verify every citation --------------------------------------- */

  const citations = new Map<string, { url: string; quote: string }>();
  for (const row of parameterRows) {
    citations.set(`${row.drug_id}|${row.parameter}`, {
      url: row.source_url,
      quote: row.source_quote,
    });
  }
  for (const row of pkRows) {
    if (!citations.has(`${row.drug_id}|row`)) {
      citations.set(`${row.drug_id}|row`, { url: row.source_url, quote: row.source_quote });
    }
  }

  const failed: Array<{ drug: string; parameter: string; why: string }> = [];
  const unverifiable: Array<{ drug: string; parameter: string; why: string }> = [];
  let checked = 0;
  for (const [key, citation] of citations) {
    const [drug, parameter] = key.split('|');
    if (!citation.url || !citation.quote) continue;
    checked += 1;
    const result = await supportsQuote(citation.url, citation.quote);
    if (result.ok) {
      // fine
    } else if (result.unverifiable) {
      // The publisher would not serve the page. That is not evidence the
      // citation is wrong, so it must never demote a drug on its own.
      unverifiable.push({ drug, parameter, why: result.why });
    } else {
      failed.push({ drug, parameter, why: result.why });
    }
    // openFDA asks for no more than 240 requests a minute; stay well under.
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(
    `checked ${checked} citation(s): ${failed.length} failed, ${unverifiable.length} could not be checked`
  );
  for (const failure of failed) {
    console.log(`  FAIL ${failure.drug}/${failure.parameter}: ${failure.why}`);
  }
  for (const item of unverifiable) {
    console.log(`  SKIP ${item.drug}/${item.parameter}: ${item.why}`);
  }

  if (failed.length && apply) {
    const drugsToDemote = [...new Set(failed.map((f) => f.drug))];
    console.log(`demoting ${drugsToDemote.join(', ')} to pending`);
    // The admin key is needed to write; the anon key cannot.
    const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_ADMIN_KEY!, {
      auth: { persistSession: false },
    });
    for (const drug of drugsToDemote) {
      const { error } = await admin
        .from('drug_pk')
        .update({
          status: 'pending',
          notes: `demoted by scripts/data/refresh-pk.ts: a citation no longer supports its value`,
        })
        .eq('drug_id', drug);
      if (error) console.error(`  failed to demote ${drug}: ${error.message}`);
    }
  } else if (failed.length) {
    console.log('re-run with --apply to demote the drugs whose citation failed');
  }

  /* 2. Regenerate the engine's dataset from the approved rows ----------- */

  const approved = pkRows.filter((r) => r.status === 'approved');
  const byId = new Map(catalogue.map((d) => [d.id, d]));
  const order = [
    ...PREFERRED.filter((id) => approved.some((r) => r.drug_id === id)),
    ...approved
      .map((r) => r.drug_id)
      .filter((id) => !PREFERRED.includes(id))
      .sort(),
  ];

  const drugsJson = order.map((id) => {
    const row = approved.find((r) => r.drug_id === id)!;
    const catalogueRow = byId.get(id);
    return {
      id,
      name: catalogueRow?.name ?? id,
      route: row.route,
      model: 'one-compartment',
      ka_per_h: row.ka_per_h,
      F: row.f_bioavailability,
      CL_L_per_h_per_kg: row.cl_l_per_h_per_kg,
      V_L_per_kg: row.v_l_per_kg,
      label_dose_range_mg:
        row.dose_min_mg != null && row.dose_max_mg != null
          ? [row.dose_min_mg, row.dose_max_mg]
          : null,
      sources: [row.source_url, row.source_title].filter(Boolean),
      notes: `Approved PK row, regenerated from Supabase by scripts/data/refresh-pk.ts on ${new Date()
        .toISOString()
        .slice(0, 10)}.`,
    };
  });

  const target = join(repoRoot, 'data', 'drugs.json');
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const next = `${JSON.stringify(drugsJson, null, 2)}\n`;
  if (previous !== next) {
    writeFileSync(target, next);
    console.log(`data/drugs.json regenerated: ${drugsJson.length} drug(s) with approved parameters`);
  } else {
    console.log('data/drugs.json already current');
  }

  /* 3. Deep pass: re-pull the labels and re-extract candidates ------------ */

  if (deep) {
    console.log('\ndeep pass: re-fetching labels and re-extracting candidates');
    const { execFileSync } = await import('node:child_process');
    execFileSync('npx', ['tsx', 'scripts/data/fetch-labels.ts'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    execFileSync('npx', ['tsx', 'scripts/data/extract-pk.ts'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    console.log('deep pass done: candidates are in data/pk-review.candidates.csv for review');
  }

  console.log(
    `\n${approved.length} approved drug(s) in the database; the app reads them live from Supabase.`
  );
}

void main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

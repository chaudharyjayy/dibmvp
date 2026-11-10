/**
 * import-catalog — load the real openFDA NDC drug catalogue into Supabase.
 *
 * Source: https://open.fda.gov/apis/drug/ndc/  (CC0 1.0, public domain)
 * Records: ~138k products, ~7.6k unique ingredients, refreshed daily by FDA.
 *
 * What is written:
 *   public.drugs          one row per ingredient
 *   public.drug_products  one row per NDC product, with its source URL
 *
 * What is NOT written:
 *   public.drug_pk        never touched here. PK values need a citation per
 *                         row and go through scripts/data/import-pk.ts.
 *
 * Usage:
 *   npm run data:import:dry                     # no network, no database
 *   npm run data:import -- [--limit 5000]       # small live sample
 *   npm run data:import                         # full catalogue
 *   npm run data:import -- --file /path/ndc.json
 *
 * Idempotent: every write is an upsert on the primary key.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildCatalog, type NdcProduct } from './lib/catalog';
import { parseArgs, repoRoot, requireWriteCredentials } from './lib/env';

const NDC_URL = 'https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json';
const CACHE_DIR = join(repoRoot, 'data', '.cache');
const CACHE_FILE = join(CACHE_DIR, 'drug-ndc.json');

async function ensureSource(file?: string): Promise<string> {
  if (file) return file;
  if (existsSync(CACHE_FILE)) {
    const ageDays = (Date.now() - statSync(CACHE_FILE).mtimeMs) / 86_400_000;
    const note = ageDays > 7 ? ` — ${ageDays.toFixed(0)} days old, delete it to refresh` : '';
    console.log(`source: cached ${CACHE_FILE}${note}`);
    return CACHE_FILE;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`source: downloading ${NDC_URL} (about 236 MB, once)`);
  const res = await fetch(NDC_URL);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(CACHE_FILE));
  return CACHE_FILE;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit ?? 0);
  if (Number.isFinite(limit) && limit > 0 && !args.dry) {
    // A sample would overwrite product_count and routes for the sampled drugs
    // while leaving the rest untouched, so the table would describe neither the
    // sample nor the feed.
    console.error('--limit is only valid with --dry; run the full import to write.');
    process.exit(1);
  }
  const source = await ensureSource(typeof args.file === 'string' ? args.file : undefined);
  const raw = JSON.parse(readFileSync(source, 'utf8')) as { results?: NdcProduct[] };
  let records = raw.results ?? [];
  if (Number.isFinite(limit) && limit > 0) records = records.slice(0, limit);

  const t0 = Date.now();
  const { drugs, products, stats } = buildCatalog(records);
  console.log(
    [
      `parsed ${stats.productsIn.toLocaleString('en-US')} products in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      `  products kept:      ${stats.productsOut.toLocaleString('en-US')}`,
      `  duplicate product NDCs collapsed: ${stats.duplicateProducts.toLocaleString('en-US')}`,
      `  skipped (no ingredients): ${stats.skippedNoIngredients.toLocaleString('en-US')}`,
      `  ingredients:        ${stats.ingredients.toLocaleString('en-US')}`,
      `  oral ingredients:   ${stats.oralIngredients.toLocaleString('en-US')}`,
      `  combination products: ${stats.combinationProducts.toLocaleString('en-US')}`,
    ].join('\n')
  );

  if (args.dry) {
    mkdirSync(CACHE_DIR, { recursive: true });
    const preview = join(CACHE_DIR, 'catalog-preview.json');
    writeFileSync(
      preview,
      JSON.stringify({ stats, drugs: drugs.slice(0, 25), products: products.slice(0, 25) }, null, 2)
    );
    console.log(`dry run: no network, no writes. Preview: ${preview}`);
    return;
  }

  const { url, adminKey } = requireWriteCredentials();
  const db = createClient(url, adminKey, { auth: { persistSession: false } });

  async function upsertAll<T extends Record<string, unknown>>(
    table: string,
    rows: T[],
    onConflict: string
  ): Promise<number> {
    const batches = chunk(rows, 500);
    let done = 0;
    for (let i = 0; i < batches.length; i++) {
      const { error } = await db.from(table).upsert(batches[i], { onConflict });
      if (error) throw new Error(`${table} batch ${i + 1}/${batches.length}: ${error.message}`);
      done += batches[i].length;
      if ((i + 1) % 20 === 0 || i === batches.length - 1) {
        console.log(`  ${table}: ${done.toLocaleString('en-US')}/${rows.length.toLocaleString('en-US')}`);
      }
    }
    return done;
  }

  console.log(`uploading to ${new URL(url).host}`);
  const drugCount = await upsertAll('drugs', drugs, 'id');
  const productCount = await upsertAll('drug_products', products, 'product_ndc');

  const [{ count: dbDrugs }, { count: dbProducts }] = await Promise.all([
    db.from('drugs').select('*', { count: 'exact', head: true }),
    db.from('drug_products').select('*', { count: 'exact', head: true }),
  ]);

  console.log(
    [
      `uploaded drugs:    ${drugCount.toLocaleString('en-US')} (table now ${dbDrugs?.toLocaleString('en-US') ?? '?'})`,
      `uploaded products: ${productCount.toLocaleString('en-US')} (table now ${dbProducts?.toLocaleString('en-US') ?? '?'})`,
      'PK rows are untouched: run `npm run data:pk` after a review file exists.',
    ].join('\n')
  );
}

void main().catch((e: unknown) => {
  console.error(`import-catalog: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

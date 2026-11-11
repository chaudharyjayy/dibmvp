/**
 * extract-interactions — find drug pairs the labels mention, and check them
 * against the catalogue we already hold.
 *
 * The engine's `data/interactions.json` is hand-verified on purpose: every
 * pair there carries a severity, a mechanism and a citation. This script does
 * not write that file. It writes a *candidate* sheet with the sentence that
 * mentions the pair, the label it came from, and a suggested severity that a
 * human then confirms or throws away.
 *
 * The pair list comes from our own catalogue (`public.drugs`), so a mention
 * only becomes a candidate when it names something we actually hold.
 *
 * Usage:
 *   npm run data:interactions:candidates
 *   npm run data:interactions:candidates -- --drug ibuprofen
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseArgs, readRepoEnv, repoRoot } from './lib/env';
import { canonicalName } from './lib/names';

const CACHE = join(repoRoot, 'data', '.cache', 'labels');
const INDEX = join(CACHE, 'index.json');
const OUT = join(repoRoot, 'data', 'interactions.candidates.csv');

/** How many catalogue names to look for in the label text. */
const CATALOGUE_LIMIT = 600;

type Label = { [key: string]: unknown };
type IndexRow = {
  drug: string;
  slug: string;
  citationUrl: string | null;
  setId: string | null;
  effectiveTime: string | null;
  [key: string]: unknown;
};

/** The severity words a label actually uses, strongest first. */
function suggestSeverity(sentence: string): { severity: string; why: string } {
  if (/\bcontraindicat(ed|ion)\b/i.test(sentence)) {
    return { severity: 'major', why: 'the label says the combination is contraindicated' };
  }
  if (/\b(avoid|do not use|should not be used|not be co-?administered)\b/i.test(sentence)) {
    return { severity: 'moderate', why: 'the label says to avoid the combination' };
  }
  if (/\b(increase|increase[s]?|decrease|decrease[s]?|alter|reduce[sd]?|raise[sd]?)\b/i.test(sentence)) {
    return { severity: 'minor', why: 'the label describes a change in exposure without saying to avoid it' };
  }
  return { severity: 'minor', why: 'the label mentions the other drug but states no severity language' };
}

function labelSections(label: Label, keys: string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = label[key];
    if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === 'string') parts.push(entry);
    }
  }
  return parts.join(' ');
}

function splitSentences(text: string): string[] {
  return text
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .split(/(?<![0-9])[.;:]\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);
}

/** Names are matched on word boundaries so "iron" does not match "irinotecan". */
function mentions(sentence: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence);
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(INDEX)) {
    console.log('No cached labels. Run: npm run data:labels');
    return;
  }
  const env = readRepoEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.log('SKIP: .env needs SUPABASE_URL and SUPABASE_ANON_KEY to read the catalogue.');
    process.exit(2);
  }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  // Our catalogue: the names we actually hold.
  const { data: catalogue, error } = await db
    .from('drugs')
    .select('id,name,product_count')
    .order('product_count', { ascending: false })
    .limit(CATALOGUE_LIMIT);
  if (error || !catalogue) {
    console.log(`SKIP: could not read the catalogue: ${error?.message ?? 'no rows'}`);
    process.exit(2);
  }
  console.log(`catalogue names to look for: ${catalogue.length}`);

  const index = JSON.parse(readFileSync(INDEX, 'utf8')) as { rows: IndexRow[] };
  const only = typeof args.drug === 'string' ? args.drug.toLowerCase() : null;

  const rows: string[][] = [];
  for (const row of index.rows) {
    if (only && row.drug.toLowerCase() !== only && row.slug !== only) continue;
    const file = join(CACHE, `${row.slug}.json`);
    if (!existsSync(file)) continue;
    const label = (JSON.parse(readFileSync(file, 'utf8')) as { label: Label | null }).label;
    if (!label) continue;

    const text = labelSections(label, ['drug_interactions', 'warnings_and_cautions']);
    const sentences = splitSentences(text);
    const subject = row.drug.toLowerCase();
    const subjectKey = canonicalName(subject);

    let count = 0;
    for (const sentence of sentences) {
      for (const entry of catalogue) {
        const name = entry.name;
        if (!name || name.length < 5) continue;
        if (canonicalName(name) === subjectKey) continue; // the same drug, two names
        if (!mentions(sentence, name)) continue;
        const suggestion = suggestSeverity(sentence);
        rows.push([
          row.drug,
          name,
          suggestion.severity,
          'suggested from label wording — verify before it enters data/interactions.json',
          sentence,
          row.citationUrl ?? '',
          `DailyMed label ${row.setId ?? ''} (effective ${row.effectiveTime ?? 'unknown'})`,
          suggestion.why,
        ]);
        count += 1;
        break; // one pair per sentence keeps the sheet readable
      }
    }
    console.log(`${row.drug}: ${count} candidate pairs from ${sentences.length} sentences`);
  }

  const header = [
    'drug_a',
    'drug_b',
    'suggested_severity',
    'status',
    'source_quote',
    'source_url',
    'source_title',
    'why',
  ];
  writeFileSync(OUT, [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n');
  console.log(`\nwrote ${rows.length} candidate pairs to ${OUT}`);
  console.log('Nothing here is approved: data/interactions.json stays empty until a human checks each pair.');
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

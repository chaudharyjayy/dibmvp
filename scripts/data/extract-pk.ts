/**
 * extract-pk — pull candidate pharmacokinetic values out of the cached labels.
 *
 * The label text is the source of truth here, and the output is a *candidate*:
 * every row is written with status `pending` and no reviewer. Nothing in this
 * file can approve anything. The rule the project already has is the rule this
 * script follows: if a value has no source, it stays null.
 *
 * Two outputs:
 *   data/pk-evidence.csv          one row per parameter, with the sentence it
 *                                 came from, the label it came from, and how
 *                                 the value was read (stated | converted |
 *                                 derived)
 *   data/pk-review.candidates.csv the same shape as data/pk-review.csv, ready
 *                                 for a human to check and move across
 *
 * What the labels actually contain (verified on the four drugs):
 *   - an absorption rate constant is never stated; only a time to peak
 *   - clearance is often given as CL/F, which is not clearance
 *   - volume of distribution is sometimes a total in litres, not per kg
 *   - bioavailability is sometimes qualitative only
 * So most rows will have nulls. That is the truth, not a gap in the parser.
 *
 * Usage:
 *   npm run data:pk:candidates
 *   npm run data:pk:candidates -- --drug ibuprofen
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseArgs, readRepoEnv, repoRoot } from './lib/env';
import { canonicalName } from './lib/names';

const CACHE = join(repoRoot, 'data', '.cache', 'labels');
const INDEX = join(CACHE, 'index.json');
const EVIDENCE_OUT = join(repoRoot, 'data', 'pk-evidence.csv');
const CANDIDATES_OUT = join(repoRoot, 'data', 'pk-review.candidates.csv');

/** Body weight used only to turn a total volume (litres) into L/kg. */
const WEIGHT_KG = 70;

type Label = {
  id?: string;
  set_id?: string;
  effective_time?: string;
  openfda?: Record<string, string[] | undefined>;
  [key: string]: unknown;
};

type IndexRow = {
  drug: string;
  slug: string;
  labelId: string | null;
  setId: string | null;
  effectiveTime: string | null;
  citationUrl: string | null;
  pkSections: string[];
  [key: string]: unknown;
};

type Evidence = {
  drug: string;
  parameter: string;
  value: string;
  unit: string;
  stored: string;
  how: 'stated' | 'converted' | 'derived';
  quote: string;
  sourceUrl: string;
  sourceTitle: string;
  confidence: 'high' | 'medium' | 'low';
  note: string;
};

/**
 * Split a label section into sentences long enough to stand as a quote.
 *
 * The boundary must not fire inside a decimal ("1.8 to 2.0 hours") or inside
 * a section heading run-on ("Absorption Distribution Excretion The mean
 * volume ..."), so a split is only allowed after a period that follows a
 * space and a capital, and never straight after a digit.
 */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<![0-9])[.;:]\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    // "The serum half-life is 1.8 to 2.0 hours" is 39 characters and is
    // exactly the sentence we want, so the floor stays low.
    .filter((s) => s.length >= 25);
}

function labelText(label: Label, keys: string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = label[key];
    if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === 'string') parts.push(entry);
    }
  }
  // Labels carry inline markup inside numbers ("0.<tag>12 L/kg"), so the
  // tags come out as "0 . 12". Joining the digits back is what stops
  // "0.12 L/kg" from being read as "12 L/kg".
  return parts.join(' ').replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

type ParsedTable = { header: string[]; rows: string[][] };

/**
 * openFDA carries the numeric PK tables as HTML. The prose usually only
 * describes them ("volume of distribution at steady-state [Vss]) following
 * administration of ..."), so the table is where the numbers are.
 */
function parseTables(label: Label): ParsedTable[] {
  const html: string[] = [];
  for (const key of ['pharmacokinetics_table', 'clinical_pharmacology_table']) {
    const value = label[key];
    if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === 'string') html.push(entry);
    }
  }
  const tables: ParsedTable[] = [];
  for (const block of html) {
    const body = block.split(/<table/i).slice(1).map((part) => part.split(/<\/table>/i)[0]);
    for (const table of body) {
      const rows = table
        .split(/<tr/i)
        .slice(1)
        .map((row) => row.split(/<\/tr>/i)[0])
        .map((row) =>
          row
            .split(/<t[dh]/i)
            .slice(1)
            // The split leaves the cell's attributes behind; drop everything
            // up to the closing ">" before stripping the inner tags.
            .map((cell) =>
              cell
                .replace(/^[^>]*>/, '')
                .split(/<\/t[dh]>/i)[0]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&#x?[0-9A-Fa-f]+;/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            )
        )
        .filter((row) => row.length > 1);
      if (rows.length > 1) tables.push({ header: rows[0], rows: rows.slice(1) });
    }
  }
  return tables;
}

/** "0.27 (0.08)" -> 0.27 */
function firstNumber(cell: string): number | null {
  const match = cell.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Find a PK parameter in the label's own table.
 *
 * The header can span two rows (a spanning "Subpopulations | Mean (SD)" cell
 * above the parameter names), and the data rows carry one more cell than the
 * parameter row because of that leading population column. Both shapes are
 * handled by locating the row that names the parameters and measuring the
 * offset against the data row.
 */
function readTable(
  tables: ParsedTable[],
  parameter: { header: RegExp; population?: RegExp }
): { value: number; quote: string; population: string } | null {
  for (const table of tables) {
    // The parameter names may be in the first row or in the second.
    const headerIndex = [table.header, table.rows[0] ?? []].findIndex((row) =>
      row.some((cell) => parameter.header.test(cell))
    );
    if (headerIndex < 0) continue;
    const headerRow = headerIndex === 0 ? table.header : table.rows[0];
    const dataRows = headerIndex === 0 ? table.rows : table.rows.slice(1);
    const column = headerRow.findIndex((cell) => parameter.header.test(cell));
    if (column < 0) continue;

    for (const row of dataRows) {
      const population = row[0] ?? '';
      if (parameter.population && !parameter.population.test(population)) continue;
      // The population column shifts the parameter columns by one.
      const offset = row.length - headerRow.length;
      const cell = row[column + offset] ?? row[column] ?? '';
      const value = firstNumber(cell);
      if (value === null) continue;
      const quote = headerRow
        .map((name, index) => `${name}: ${row[index + offset] ?? ''}`)
        .filter((part) => !part.endsWith(': '))
        .join(' | ');
      return { value, quote: `Table — ${population} | ${quote}`, population };
    }
  }
  return null;
}

/** First sentence matching a pattern, with the matching span. */
function findSentence(
  sentencesList: string[],
  pattern: RegExp
): { sentence: string; match: RegExpMatchArray } | null {
  for (const sentence of sentencesList) {
    const match = sentence.match(pattern);
    if (match) return { sentence, match };
  }
  return null;
}

/**
 * All matches in one string. Labels often state several values in one
 * sentence ("0.8 to 0.9 L/kg in infants ... 0.6 L/kg in adults"), so the
 * reader needs to choose, not just find the first.
 */
function allMatches(text: string, pattern: RegExp): Array<{ sentence: string; match: RegExpMatchArray }> {
  const out: Array<{ sentence: string; match: RegExpMatchArray }> = [];
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    out.push({ sentence: text, match });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return out;
}

/** All matches across a list of sentences. */
function findAll(sentencesList: string[], pattern: RegExp): Array<{ sentence: string; match: RegExpMatchArray }> {
  return sentencesList.flatMap((sentence) => allMatches(sentence, pattern));
}

/** Prefer a match whose surroundings mention the adult population. */
function preferAdult<T extends { match: RegExpMatchArray }>(hits: T[]): T | null {
  if (!hits.length) return null;
  const adult = hits.find((hit) => {
    const start = Math.max(0, (hit.match.index ?? 0) - 60);
    return /adult/i.test(hit.match.input.slice(start, hit.match.index));
  });
  return adult ?? hits[0];
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)));
}

/* ------------------------------------------------------------------ */
/* Parameter readers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Flag a value that comes from a population the simulator does not model.
 * The engine is population-average and adult; a value quoted from a
 * paediatric or neonatal study must not be read as an adult value.
 */
function populationCaveat(quote: string): { confidence: 'high' | 'medium' | 'low'; note: string } | null {
  if (/\b(neonate|neonates|neonatal|infant|infants|children|pediatric|paediatric)\b/i.test(quote)) {
    return {
      confidence: 'low',
      note: 'population caveat: the quoted value is from a paediatric or neonatal study, not adults',
    };
  }
  return null;
}

function readF(sentencesList: string[]): Evidence[] {
  const out: Evidence[] = [];
  const hits = findAll(
    sentencesList,
    /[\s\S]{0,140}?absolute bioavailability[\s\S]{0,120}?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/i
  );
  for (const hit of hits.slice(0, 2)) {
    const value = num(hit.match[1]);
    if (value === null || value <= 0 || value > 100) continue;
    const caveat = populationCaveat(hit.sentence);
    out.push({
      parameter: 'f_bioavailability',
      value: String(value),
      unit: 'percent',
      stored: round(value / 100),
      how: 'converted',
      quote: hit.sentence,
      confidence: caveat?.confidence ?? 'high',
      note: caveat?.note ?? `absolute bioavailability ${value}% read as F=${round(value / 100)}`,
    });
    break;
  }
  return out;
}

function readV(sentencesList: string[]): Evidence[] {
  const out: Evidence[] = [];
  // The phrase appears once but the numbers can appear twice ("0.8 to 0.9
  // L/kg in infants ... 0.6 L/kg in adults"), so the phrase is located first
  // and the values are read out of that sentence separately.
  // The phrase may be absent ("adults have a volume of approximately 0.12
  // L/kg"), so any sentence that talks about a volume is considered.
  const volumeSentences = sentencesList.filter((s) => /\bvolume\b/i.test(s));
  for (const sentence of volumeSentences) {
    const perKg = allMatches(sentence, /(\d+(?:\.\d+)?)\s*(?:L\/kg|l\/kg|liters\/kg|litres\/kg)/gi);
    const adultPerKg = perKg.find((hit) => {
      const start = Math.max(0, (hit.match.index ?? 0) - 70);
      return /adult/i.test(sentence.slice(start, hit.match.index));
    });
    const chosen = adultPerKg ?? perKg[0];
    if (chosen) {
      const value = num(chosen.match[1]);
      if (value !== null && value > 0) {
        out.push({
          parameter: 'v_l_per_kg',
          value: String(value),
          unit: 'L/kg',
          stored: round(value),
          how: 'stated',
          quote: sentence,
          confidence: 'high',
          note: adultPerKg
            ? 'volume of distribution per kilogram, adult population'
            : /volume of distribution/i.test(sentence)
              ? 'volume of distribution stated per kilogram — population not stated in the sentence'
              : 'volume per kilogram — the sentence does not say "volume of distribution"; check before approving',
        });
        return out;
      }
    }
    const total = allMatches(sentence, /(\d+(?:\.\d+)?)\s*(?:L|liters|litres)\b/gi);
    const adultTotal = total.find((hit) => {
      const start = Math.max(0, (hit.match.index ?? 0) - 70);
      return /adult/i.test(sentence.slice(start, hit.match.index));
    });
    const chosenTotal = adultTotal ?? total[0];
    if (chosenTotal) {
      const value = num(chosenTotal.match[1]);
      if (value !== null && value > 0) {
        out.push({
          parameter: 'v_l_per_kg',
          value: String(value),
          unit: 'L (total)',
          stored: round(value / WEIGHT_KG),
          how: 'converted',
          quote: sentence,
          confidence: 'medium',
          note: `total volume ${value} L converted to L/kg assuming ${WEIGHT_KG} kg — check before approving`,
        });
        return out;
      }
    }
  }
  return out;
}

function readCl(sentencesList: string[]): Evidence[] {
  const out: Evidence[] = [];
  const perKg = preferAdult(
    findAll(
      sentencesList,
      /[\s\S]{0,160}?(?:total |plasma |renal |apparent )?clearance (?:of|was|is|were)[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*(mL\/min\/kg|mL\/h\/kg|mL\/kg\/min|L\/h\/kg|l\/h\/kg)/i
    )
  );
  if (perKg) {
    const value = num(perKg.match[1]);
    const unit = perKg.match[2];
    if (value !== null && value > 0) {
      let stored = value;
      let note = '';
      if (unit.toLowerCase() === 'ml/min/kg') {
        stored = value * 0.06; // mL/min/kg -> L/h/kg
        note = `${value} mL/min/kg converted to ${round(stored)} L/h/kg`;
      } else if (unit.toLowerCase() === 'ml/h/kg') {
        stored = value * 0.001;
        note = `${value} mL/h/kg converted to ${round(stored)} L/h/kg`;
      } else {
        note = `${value} ${unit} read as-is`;
      }
      out.push({
        parameter: 'cl_l_per_h_per_kg',
        value: String(value),
        unit,
        stored: round(stored),
        how: unit.toLowerCase() === 'l/h/kg' ? 'stated' : 'converted',
        quote: perKg.sentence,
        confidence: 'high',
        note,
      });
      return out;
    }
  }
  // CL/F is not clearance: record it, but never as the clearance value.
  const clOverF = findSentence(
    sentencesList,
    /[\s\S]{0,160}?\bCL\/F\b[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*(mL\/h\/kg|mL\/min\/kg|mL\/kg\/h)/i
  );
  if (clOverF) {
    out.push({
      parameter: 'cl_over_f',
      value: clOverF.match[1],
      unit: clOverF.match[2],
      stored: '',
      how: 'stated',
      quote: clOverF.sentence,
      confidence: 'high',
      note: 'CL/F is clearance divided by bioavailability — it is NOT clearance and is not used as such',
    });
  }
  return out;
}

function readHalfLife(sentencesList: string[]): Evidence[] {
  const found = findSentence(
    sentencesList,
    /[\s\S]{0,120}?half-?life[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*(?:to\s+(\d+(?:\.\d+)?)\s*)?(?:hours|hour|hrs|hr)\b/i
  );
  if (!found) return [];
  const value = num(found.match[1]);
  if (value === null || value <= 0) return [];
  return [
    {
      parameter: 't_half_h',
      value: String(value),
      unit: 'hours',
      stored: String(value),
      how: 'stated',
      quote: found.sentence,
      confidence: 'high',
      note: 'elimination half-life — context for the reviewer, not a model input',
    },
  ];
}

function readTmax(sentencesList: string[]): Evidence[] {
  const found = findSentence(
    sentencesList,
    /[\s\S]{0,160}?(?:peak(?: plasma| serum| blood)? concentration[\s\S]{0,140}?|time to reach peak concentration|T\s?max)[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*(hours|hour|minutes|min)\b/i
  );
  if (!found) return [];
  // "T max is delayed by approximately 30 to 60 minutes" is a delay, not a
  // time to peak. A number that belongs to a delay or a reduction is not one.
  if (/\b(delay|delayed|reduce|reduced|decrease|decreased)\b/i.test(found.match[0])) return [];
  const value = num(found.match[1]);
  const unit = found.match[2].toLowerCase();
  if (value === null || value <= 0) return [];
  const hours = unit.startsWith('min') ? value / 60 : value;
  const caveat = populationCaveat(found.sentence);
  return [
    {
      parameter: 't_max_h',
      value: String(value),
      unit,
      stored: round(hours),
      how: unit.startsWith('min') ? 'converted' : 'stated',
      quote: found.sentence,
      confidence: caveat?.confidence ?? 'medium',
      note:
        caveat?.note ??
        'time to peak concentration — no label states an absorption rate constant, so ka is not taken from here automatically',
    },
  ];
}

/**
 * The label's own numeric table. The prose usually only says "volume of
 * distribution at steady-state [Vss]) following administration of a single
 * intravenous dose ...", so the table is where the number is.
 */
function readFromTables(tables: ParsedTable[]): Evidence[] {
  const out: Evidence[] = [];
  const adults = /adult/i;

  const cl = readTable(tables, { header: /^(CL|clearance)\b/i, population: adults });
  if (cl) {
    out.push({
      parameter: 'cl_l_per_h_per_kg',
      value: String(cl.value),
      unit: 'L/h/kg',
      stored: round(cl.value),
      how: 'stated',
      quote: cl.quote,
      confidence: 'high',
      note: `label table, ${cl.population} row`,
    });
  }

  const v = readTable(tables, { header: /^(Vss|Vd|volume of distribution)\b/i, population: adults });
  if (v) {
    out.push({
      parameter: 'v_l_per_kg',
      value: String(v.value),
      unit: 'L/kg',
      stored: round(v.value),
      how: 'stated',
      quote: v.quote,
      confidence: 'high',
      note: `label table, ${v.population} row`,
    });
  }

  const half = readTable(tables, { header: /^(T\s*1\/2|half-?life)\b/i, population: adults });
  if (half) {
    out.push({
      parameter: 't_half_h',
      value: String(half.value),
      unit: 'hours',
      stored: String(half.value),
      how: 'stated',
      quote: half.quote,
      confidence: 'high',
      note: `label table, ${half.population} row — context for the reviewer, not a model input`,
    });
  }

  const tmax = readTable(tables, { header: /^(T\s?max|peak time)\b/i, population: adults });
  if (tmax) {
    out.push({
      parameter: 't_max_h',
      value: String(tmax.value),
      unit: 'hours',
      stored: round(tmax.value),
      how: 'stated',
      quote: tmax.quote,
      confidence: 'medium',
      note: `label table, ${tmax.population} row — no label states an absorption rate constant`,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(cells: Array<string | number | null>): string {
  return cells.map(csvCell).join(',');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(INDEX)) {
    console.log('No cached labels. Run: npm run data:labels');
    return;
  }

  // The candidate rows go into drug_pk, whose drug_id is a foreign key to
  // public.drugs.id. So the catalogue id is resolved here, not guessed from
  // the label: our engine says paracetamol, the catalogue says acetaminophen.
  const env = readRepoEnv();
  const catalogue = new Map<string, string>();
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from('drugs')
        .select('id,name')
        .range(from, from + 999);
      if (error || !data) break;
      for (const entry of data) catalogue.set(canonicalName(entry.name), entry.id);
      if (data.length < 1000) break;
    }
  } else {
    console.log('SKIP: .env needs SUPABASE_URL and SUPABASE_ANON_KEY to resolve catalogue ids.');
  }

  const index = JSON.parse(readFileSync(INDEX, 'utf8')) as { rows: IndexRow[] };
  const only = typeof args.drug === 'string' ? args.drug.toLowerCase() : null;

  const evidence: Evidence[] = [];
  const candidates: string[][] = [];

  for (const row of index.rows) {
    if (only && row.drug.toLowerCase() !== only && row.slug !== only) continue;
    const file = join(CACHE, `${row.slug}.json`);
    if (!existsSync(file)) continue;
    const cached = JSON.parse(readFileSync(file, 'utf8')) as { label: Label | null };
    const label = cached.label;
    if (!label) {
      console.log(`${row.drug}: no label cached — nothing extracted`);
      continue;
    }

    const text = labelText(label, ['pharmacokinetics', 'clinical_pharmacology', 'description']);
    const list = sentences(text);
    const tables = parseTables(label);
    const title = `DailyMed label ${row.setId ?? ''} (effective ${row.effectiveTime ?? 'unknown'})`;
    const url = row.citationUrl ?? '';

    const found: Evidence[] = [
      ...readF(list),
      ...readV(list),
      ...readCl(list),
      ...readHalfLife(list),
      ...readTmax(list),
      ...readFromTables(tables),
    ].map((item) => ({ ...item, drug: row.drug, sourceUrl: url, sourceTitle: title }));

    // The same text often appears in both the pharmacokinetics and the
    // clinical_pharmacology field; keep one copy of each finding.
    const unique: Evidence[] = [];
    const seenQuotes = new Set<string>();
    for (const item of found) {
      const key = `${item.parameter}|${item.quote}`;
      if (seenQuotes.has(key)) continue;
      seenQuotes.add(key);
      unique.push(item);
    }
    evidence.push(...unique);

    // A table value is the better evidence when both exist: it names the
    // population and the units. Prose only fills what the table missed.
    const byParam = new Map<string, Evidence>();
    for (const item of unique) {
      if (item.parameter === 'cl_over_f') continue;
      const existing = byParam.get(item.parameter);
      if (!existing) {
        byParam.set(item.parameter, item);
        continue;
      }
      const tableWins = item.quote.startsWith('Table') && !existing.quote.startsWith('Table');
      if (tableWins) byParam.set(item.parameter, item);
    }
    const pick = (parameter: string) => byParam.get(parameter);
    const clOverF = found.find((item) => item.parameter === 'cl_over_f');

    // The review row mirrors data/pk-review.csv. Anything the label does not
    // state stays empty; the quote is the longest supporting sentence.
    const quote = (pick('f_bioavailability') ?? pick('v_l_per_kg') ?? pick('cl_l_per_h_per_kg'))?.quote ?? '';
    const missing = ['f_bioavailability', 'cl_l_per_h_per_kg', 'v_l_per_kg', 't_max_h']
      .filter((parameter) => !pick(parameter))
      .join(', ');
    const notes = [
      'candidate — needs human review',
      pick('ka_per_h') ? '' : 'no label states an absorption rate constant (ka)',
      clOverF ? 'label gives CL/F, not clearance' : '',
      missing ? `not stated in this label: ${missing}` : '',
      pick('v_l_per_kg')?.how === 'converted' ? 'V converted assuming 70 kg' : '',
    ]
      .filter(Boolean)
      .join('; ');

    candidates.push([
      catalogue.get(canonicalName(row.drug)) ?? row.slug,
      'oral',
      '', // ka_per_h: never stated in a label
      pick('f_bioavailability')?.stored ?? '',
      pick('cl_l_per_h_per_kg')?.stored ?? '',
      pick('v_l_per_kg')?.stored ?? '',
      '', // dose range: extracted separately, not guessed
      '',
      url,
      quote,
      title,
      '', // reviewer: a human must fill this
      '', // reviewed_at
      'pending',
      notes,
    ]);

    console.log(
      `${row.drug}: ${found.length} evidence rows (${[...byParam.keys()].join(', ') || 'none'})`
    );
  }

  const evidenceHeader = csvRow([
    'drug',
    'parameter',
    'value',
    'unit',
    'stored_value',
    'how',
    'quote',
    'source_url',
    'source_title',
    'confidence',
    'note',
  ]);
  const evidenceRows = evidence.map((item) =>
    csvRow([
      item.drug,
      item.parameter,
      item.value,
      item.unit,
      item.stored,
      item.how,
      item.quote,
      item.sourceUrl,
      item.sourceTitle,
      item.confidence,
      item.note,
    ])
  );

  const candidateHeader = csvRow([
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
  ]);

  writeFileSync(EVIDENCE_OUT, [evidenceHeader, ...evidenceRows].join('\n') + '\n');
  writeFileSync(CANDIDATES_OUT, [candidateHeader, ...candidates].join('\n') + '\n');
  console.log(`\nwrote ${evidenceRows.length} evidence rows to ${EVIDENCE_OUT}`);
  console.log(`wrote ${candidates.length} candidate rows to ${CANDIDATES_OUT}`);
  console.log('Every candidate is status=pending with no reviewer: nothing here is approved.');
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

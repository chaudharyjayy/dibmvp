/**
 * fetch-labels — pull real FDA drug labels and cache them with their citations.
 *
 * Source: openFDA drug label API (https://api.fda.gov/drug/label.json), which
 * republishes the Structured Product Labels that DailyMed hosts. Both are US
 * government works: public domain, no key, no licence to track.
 *
 * What lands on disk:
 *   data/.cache/labels/<slug>.json   the raw responses, plus the exact query
 *   data/.cache/labels/index.json    one row per drug with the label's
 *                                    provenance and the sections we care about
 *
 * Nothing here decides a pharmacokinetic value or an interaction. It only
 * fetches the text a reviewer will read, and records where it came from, so
 * that a citation can be checked before any number is trusted.
 *
 * Usage:
 *   npm run data:labels
 *   npm run data:labels -- --drugs "caffeine,acetaminophen,ibuprofen,aspirin"
 *   npm run data:labels -- --drug caffeine --list
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, repoRoot } from './lib/env';
import { searchNames } from './lib/names';

const OPENFDA = 'https://api.fda.gov/drug/label.json';
const DAILYMED_SPL = 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json';
const CACHE = join(repoRoot, 'data', '.cache', 'labels');

/** Sections that carry pharmacokinetic statements. */
const PK_SECTIONS = ['pharmacokinetics', 'clinical_pharmacology', 'description'] as const;
/** Sections that carry drug-interaction statements. */
const INTERACTION_SECTIONS = ['drug_interactions', 'warnings_and_cautions'] as const;

type Label = {
  id?: string;
  set_id?: string;
  effective_time?: string;
  version?: string;
  openfda?: Record<string, string[] | undefined>;
  [key: string]: unknown;
};

type IndexRow = {
  drug: string;
  slug: string;
  query: string;
  labelId: string | null;
  setId: string | null;
  splId: string | null;
  applicationNumber: string | null;
  effectiveTime: string | null;
  labelTypes: string[];
  routes: string[];
  citationUrl: string | null;
  citationKind: 'dailymed' | 'accessdata' | null;
  dailymedVerified: boolean | null;
  pkSections: string[];
  interactionSections: string[];
  pkChars: number;
  interactionChars: number;
  note?: string;
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function getJson(url: string, attempt = 0): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dibmvp-data-scripts' },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) throw new Error(`HTTP ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return getJson(url, attempt + 1);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 120)}`);
  }
}

/**
 * The openFDA searches for one drug, best first. The `_exists_` filter is the
 * important one: the OTC label format (21 CFR 201.10) has no clinical
 * pharmacology section at all, so without it the search returns dozens of
 * consumer labels with nothing to read.
 */
function searchUrls(name: string): { url: string; label: string }[] {
  const quoted = encodeURIComponent(`"${name}"`);
  const base = 'https://api.fda.gov/drug/label.json';
  return [
    {
      url: `${base}?search=openfda.generic_name:${quoted}+AND+_exists_:clinical_pharmacology&limit=20`,
      label: 'generic_name+has_clinical_pharmacology',
    },
    {
      url: `${base}?search=openfda.generic_name:${quoted}+AND+_exists_:drug_interactions&limit=20`,
      label: 'generic_name+has_drug_interactions',
    },
    {
      url: `${base}?search=openfda.generic_name:${quoted}&limit=20`,
      label: 'generic_name',
    },
    {
      url: `${base}?search=openfda.substance_name:${quoted}+AND+_exists_:clinical_pharmacology&limit=20`,
      label: 'substance_name+has_clinical_pharmacology',
    },
    {
      url: `${base}?search=openfda.substance_name:${quoted}&limit=20`,
      label: 'substance_name',
    },
    {
      url: `${base}?search=openfda.brand_name:${quoted}&limit=20`,
      label: 'brand_name',
    },
  ];
}

/**
 * Normalised substance names a label actually contains.
 *
 * openFDA's generic_name is the product's ingredient list, so searching
 * "caffeine" returns aspirin/caffeine combination labels and searching
 * "acetaminophen" returns hydrocodone/acetaminophen ones. Their clinical
 * pharmacology section describes a different drug. A label is only usable for
 * a drug when every substance it contains is that drug (a salt counts as the
 * same drug: "caffeine citrate" is caffeine).
 */
function labelSubstances(label: Label): string[] {
  const names = label.openfda?.substance_name ?? label.openfda?.generic_name ?? [];
  return names.map((name) => name.toLowerCase().trim()).filter(Boolean);
}

function normaliseSubstance(name: string): string {
  return name
    .replace(/\b(sodium|potassium|calcium|magnesium|chloride|bromide|sulfate|sulphate|tartrate|succinate|acetate|citrate|maleate|mesylate|besylate|phosphate|hydrochloride|anhydrous|sodium)\b/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the label contains only the drug we are sourcing. */
function isSingleIngredientFor(label: Label, targets: string[]): boolean {
  const substances = labelSubstances(label);
  if (!substances.length) return false;
  const wanted = targets.map((t) => normaliseSubstance(t.toLowerCase()));
  return substances.every((substance) => {
    const plain = normaliseSubstance(substance);
    return wanted.some((target) => plain === target || plain.startsWith(`${target} `));
  });
}

/**
 * Pick the label most likely to carry the statements we need: single
 * ingredient, with a clinical pharmacology section, recent, oral.
 */
function pickLabel(labels: Label[], targets: string[]): Label | null {
  const chars = (label: Label, key: string): number => {
    const value = label[key];
    if (!Array.isArray(value)) return 0;
    return value.reduce((sum, entry) => sum + (typeof entry === 'string' ? entry.length : 0), 0);
  };
  const score = (label: Label): number => {
    let value = 0;
    value += Math.min(12, chars(label, 'clinical_pharmacology') / 800);
    value += Math.min(10, chars(label, 'pharmacokinetics') / 800);
    value += Math.min(4, chars(label, 'description') / 1500);
    value += Math.min(6, chars(label, 'drug_interactions') / 800);
    value += Math.min(3, chars(label, 'precautions') / 2000);
    value += Math.min(2, chars(label, 'dosage_and_administration') / 800);
    // The numeric tables are where the values actually are: a label whose
    // prose only says "volume of distribution at steady-state [Vss])" is
    // worth less than one that states the number in a table.
    for (const key of ['pharmacokinetics_table', 'clinical_pharmacology_table']) {
      const tables = label[key];
      if (Array.isArray(tables)) value += Math.min(6, chars(label, key) / 400);
    }
    const routes = label.openfda?.route ?? [];
    if (routes.some((r) => r.toUpperCase().includes("ORAL"))) value += 3;
    if (routes.some((r) => r.toUpperCase() === "INTRAVENOUS")) value -= 1;
    const when = Date.parse(label.effective_time ?? "");
    if (!Number.isNaN(when)) value += Math.min(2, when / 1e12);
    return value;
  };
  const single = labels.filter((label) => isSingleIngredientFor(label, targets));
  const pool = single.length ? single : [];
  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  return sorted[0] ?? null;
}

function sectionChars(label: Label, keys: readonly string[]): number {
  let total = 0;
  for (const key of keys) {
    const value = label[key];
    if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string") total += entry.length;
    }
  }
  return total;
}

function sectionsPresent(label: Label, keys: readonly string[]): string[] {
  return keys.filter((key) => {
    const value = label[key];
    return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim());
  });
}

/** Does this SPL set id really exist in DailyMed? A citation must resolve. */
async function dailymedHasSetId(setId: string): Promise<boolean | null> {
  try {
    const data = (await getJson(`${DAILYMED_SPL}?setid=${encodeURIComponent(setId)}`)) as {
      data?: unknown[];
    } | null;
    if (!data || !Array.isArray(data.data)) return null;
    return data.data.length > 0;
  } catch {
    return null;
  }
}

function citationFor(label: Label): { url: string | null; kind: IndexRow["citationKind"] } {
  const setId = label.set_id;
  if (setId) {
    return {
      url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`,
      kind: 'dailymed',
    };
  }
  const appNumber = label.openfda?.application_number?.[0];
  if (appNumber) {
    return {
      url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${encodeURIComponent(appNumber)}`,
      kind: 'accessdata',
    };
  }
  return { url: null, kind: null };
}

async function fetchOne(drug: string): Promise<{ row: IndexRow; label: Label | null }> {
  const slug = slugify(drug);
  let label: Label | null = null;
  let usedUrl = '';
  let usedField = '';
  const attempts: Array<{ url: string; field: string; total?: number; error?: string }> = [];

  const names = searchNames(drug);
  const candidates: Label[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    for (const attempt of searchUrls(name)) {
      let body: { results?: Label[]; error?: { code?: string; message?: string } } | null = null;
      try {
        body = (await getJson(attempt.url)) as typeof body;
      } catch (error) {
        attempts.push({ ...attempt, error: (error as Error).message });
        continue;
      }
      if (body?.error) {
        attempts.push({ ...attempt, error: `${body.error.code}: ${body.error.message}` });
        continue;
      }
      const results = body?.results ?? [];
      attempts.push({ ...attempt, total: results.length });
      for (const result of results) {
        // Every name variant is tried: "paracetamol" can match a non-US
        // product with no clinical pharmacology, while "acetaminophen" has
        // the full label. The best label wins, not the first hit.
        const key = result.id ?? `${result.set_id ?? ''}:${result.effective_time ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(result);
      }
      if (candidates.length) break;
    }
  }

  if (candidates.length) {
    label = pickLabel(candidates, names);
    usedUrl = usedField = 'best-of-all-attempts';
    for (const attempt of attempts) {
      if (attempt.total) {
        usedUrl = attempt.url;
        usedField = attempt.label;
        break;
      }
    }
    if (!label) {
      const row: IndexRow = {
        drug,
        slug,
        query: JSON.stringify(attempts),
        labelId: null,
        setId: null,
        splId: null,
        applicationNumber: null,
        effectiveTime: null,
        labelTypes: [],
        routes: [],
        citationUrl: null,
        citationKind: null,
        dailymedVerified: null,
        pkSections: [],
        interactionSections: [],
        pkChars: 0,
        interactionChars: 0,
        note:
          `no single-ingredient label found (${candidates.length} candidates, all combination products or other substances); ` +
          `sources: ${JSON.stringify(attempts)}`,
      };
      return { row, label: null };
    }
  }

  if (!label) {
    const row: IndexRow = {
      drug,
      slug,
      query: '',
      labelId: null,
      setId: null,
      splId: null,
      applicationNumber: null,
      effectiveTime: null,
      labelTypes: [],
      routes: [],
      citationUrl: null,
      citationKind: null,
      dailymedVerified: null,
      pkSections: [],
      interactionSections: [],
      pkChars: 0,
      interactionChars: 0,
      note: `no label found; attempts: ${JSON.stringify(attempts)}`,
    };
    return { row, label: null };
  }

  const citation = citationFor(label);
  const verified = citation.kind === 'dailymed' ? await dailymedHasSetId(label.set_id!) : null;

  const row: IndexRow = {
    drug,
    slug,
    query: `${usedField} :: ${usedUrl}`,
    labelId: label.id ?? null,
    setId: label.set_id ?? null,
    splId: label.openfda?.spl_id?.[0] ?? null,
    applicationNumber: label.openfda?.application_number?.[0] ?? null,
    effectiveTime: label.effective_time ?? null,
    labelTypes: label.openfda?.label_type ?? [],
    routes: label.openfda?.route ?? [],
    citationUrl: citation.url,
    citationKind: citation.kind,
    dailymedVerified: verified,
    pkSections: sectionsPresent(label, PK_SECTIONS),
    interactionSections: sectionsPresent(label, INTERACTION_SECTIONS),
    pkChars: sectionChars(label, PK_SECTIONS),
    interactionChars: sectionChars(label, INTERACTION_SECTIONS),
  };
  return { row, label };
}

/** The engine's short list is the default set of drugs to source. */
function defaultDrugs(): string[] {
  try {
    const raw = join(repoRoot, 'data', 'drugs.json');
    const drugs = JSON.parse(readFileSync(raw, 'utf8')) as Array<{ id: string; name: string }>;
    return drugs.map((d) => d.name);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const list = typeof args.drugs === 'string' ? args.drugs.split(',') : defaultDrugs();
  const drugs = list.map((d) => d.trim()).filter(Boolean);

  if (drugs.length === 0) {
    console.log('No drugs to fetch. Pass --drugs "caffeine,acetaminophen" or add rows to data/drugs.json.');
    return;
  }

  mkdirSync(CACHE, { recursive: true });
  const rows: IndexRow[] = [];

  for (const drug of drugs) {
    process.stdout.write(`fetching ${drug} ... `);
    const { row, label } = await fetchOne(drug);
    rows.push(row);
    // The raw label text is the evidence a reviewer reads. It stays in the
    // git-ignored cache; only the index and the reviewed rows are committed.
    writeFileSync(
      join(CACHE, `${row.slug}.json`),
      JSON.stringify({ fetchedAt: new Date().toISOString(), index: row, label }, null, 2)
    );
    console.log(
      row.labelId
        ? `label ${row.labelId} (${row.effectiveTime ?? 'no date'}) pk=${row.pkChars}ch interactions=${row.interactionChars}ch dailymed=${row.dailymedVerified}`
        : `NO LABEL — ${row.note ?? ''}`
    );
    // openFDA asks for no more than 240 requests a minute; stay well under.
    await new Promise((r) => setTimeout(r, 250));
  }

  writeFileSync(join(CACHE, 'index.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`\nwrote ${rows.length} rows to ${join(CACHE, 'index.json')}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

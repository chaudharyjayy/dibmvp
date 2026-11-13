/**
 * validate-pk — check each approved drug against its published reference.
 *
 * For every approved drug the engine simulates the dose used in the
 * reference study (from data/validation.json) and compares simulated
 * Cmax and tmax against the published numbers, printing percent error.
 *
 * Published references carry their source quotes in data/validation.json;
 * a drug whose source prints no Cmax or tmax is marked
 * "no published reference" and shown as UNVALIDATED — nothing is filled
 * in from memory.
 *
 * Exit code 1 if any validated medicine exceeds the 25% error band;
 * unvalidated rows do not fail the command, they are why we show them.
 *
 * Usage: npm run validate:pk
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulate } from '@dib/engine';
import type { Drug } from '@dib/engine';
import { parseCsv, toObjects } from './data/lib/pk';
import { readRepoEnv, repoRoot } from './data/lib/env';

type Reference = {
  drug_id: string;
  reference_dose_mg: number;
  cmax_mg_per_l: number | null;
  tmax_h: number | null;
  source_url: string | null;
  source_quote: string | null;
  source_title: string | null;
  kind: string;
  note?: string;
  citation_pack?: Array<{ publisher_values: string; source_url: string }>;
};

type ValidationFile = {
  references: Reference[];
  /** Same 25% band for both metrics. */
  cmaxErrorFailFraction: number;
  tmaxErrorFailFraction: number;
  weightKgReference: number;
};

const readPatch = () => JSON.parse(readFileSync(join(repoRoot, 'data', 'validation.json'), 'utf8')) as ValidationFile;

const REFERENCE_PROFILE = { ageYears: 30, weightKg: 70, sex: 'other' as const };
const WINDOW_H = 10;

const loadValidationFile = (): ValidationFile => {
  try {
    return readPatch();
  } catch (e) {
    console.error(`validate-pk: cannot read data/validation.json — ${(e as Error).message}`);
    process.exit(1);
  }
};

/** Approved drugs, straight from what production serves (anon, RLS-scoped). */
async function fetchApprovedPublic(): Promise<Drug[]> {
  const env = readRepoEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('repo .env needs SUPABASE_URL and SUPABASE_ANON_KEY');
  const res = await fetch(
    `${url}/rest/v1/drug_pk_public?select=drug_id,route,ka_per_h,f_bioavailability,cl_l_per_h_per_kg,v_l_per_kg,dose_min_mg,dose_max_mg,source_url,source_title`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`drug_pk_public returned ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  const num = (v: unknown) =>
    typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : null;
  return rows
    .map((r) => {
      const drug: Drug | null =
        typeof r.drug_id === 'string' &&
        [r.ka_per_h, r.f_bioavailability, r.cl_l_per_h_per_kg, r.v_l_per_kg].every((v) => num(v) != null)
          ? {
              id: r.drug_id,
              name: r.drug_id,
              route: r.route === 'iv' ? 'iv' : 'oral',
              model: 'one-compartment',
              ka_per_h: num(r.ka_per_h)!,
              F: num(r.f_bioavailability) as number,
              CL_L_per_h_per_kg: num(r.cl_l_per_h_per_kg) as number,
              V_L_per_kg: num(r.v_l_per_kg) as number,
              studied_dose_range_mg:
                r.dose_min_mg != null && r.dose_max_mg != null
                  ? [num(r.dose_min_mg) as number, num(r.dose_max_mg) as number]
                  : null,
              sources: [r.source_url, r.source_title].filter((s): s is string => typeof s === 'string' && s.length > 0),
              notes: 'Validated from the public view; see data/validation.json.',
            }
          : null;
      return drug;
    })
    .filter((d): d is Drug => d !== null);
}

/** Fallback for offline machines: the local review sheet (approved rows only). */
function fetchApprovedLocal(): Drug[] {
  const text = readFileSync(join(repoRoot, 'data', 'pk-review.csv'), 'utf8');
  const rows = toObjects(parseCsv(text));
  return rows
    .filter((r) => r.status === 'approved')
    .map((r) => {
      const p = (k: string) => (r[k] && r[k].trim() !== '' ? Number(r[k]) : null);
      const [ka, f, cl, v] = [p('ka_per_h'), p('f_bioavailability'), p('cl_l_per_h_per_kg'), p('v_l_per_kg')];
      if (ka == null || f == null || cl == null || v == null) return null;
      return {
        id: r.drug_id,
        name: r.drug_id,
        route: r.route === 'iv' ? ('iv' as const) : ('oral' as const),
        model: 'one-compartment' as const,
        ka_per_h: ka,
        F: f,
        CL_L_per_h_per_kg: cl,
        V_L_per_kg: v,
        studied_dose_range_mg:
          p('dose_min_mg') != null && p('dose_max_mg') != null
            ? [p('dose_min_mg') as number, p('dose_max_mg') as number]
            : null,
        sources: [r.source_url].filter(Boolean),
        notes: 'Validated from data/pk-review.csv.',
      };
    })
    .filter((d): d is Drug => d !== null);
}

const pct = (sim: number, pub: number) => Math.abs((sim - pub) / pub) * 100;

async function main() {
  let approved: Drug[];
  try {
    approved = await fetchApprovedPublic();
    console.log(`approved rows from the live public view: ${approved.length}`);
  } catch (e) {
    console.log(`live view unavailable (${(e as Error).message}); using local pk-review.csv`);
    approved = fetchApprovedLocal();
    console.log(`approved rows from data/pk-review.csv: ${approved.length}`);
  }

  const validation = loadValidationFile();
  const refs = new Map(validation.references.map((r) => [r.drug_id, r]));

  let failures = 0;
  const table: string[] = [];
  for (const drug of approved) {
    const ref = refs.get(drug.id);
    if (!ref || (ref.cmax_mg_per_l == null && ref.tmax_h == null)) {
      table.push(`${drug.id.padEnd(28)} no published reference — UNVALIDATED`);
      continue;
    }
    const res = simulate({
      profile: REFERENCE_PROFILE,
      drug,
      doses: [{ drugId: drug.id, doseMg: ref.reference_dose_mg, timeH: 0 }],
      tEndH: WINDOW_H,
      dtH: 0.05,
    });
    const cmaxPct = ref.cmax_mg_per_l != null ? pct(res.cmaxMgPerL, ref.cmax_mg_per_l) : null;
    const tmaxPct = ref.tmax_h != null ? pct(res.tmaxH, ref.tmax_h) : null;
    if ((cmaxPct ?? 0) > validation.cmaxErrorFailFraction * 100) failures += 1;
    if ((tmaxPct ?? 0) > validation.tmaxErrorFailFraction * 100) failures += 1;
    table.push(
      [
        drug.id.padEnd(28),
        `dose ${ref.reference_dose_mg} mg`,
        cmaxPct == null
          ? 'Cmax n/a'
          : `Cmax sim ${res.cmaxMgPerL.toFixed(3)} vs pub ${ref.cmax_mg_per_l} mg/L → ${cmaxPct.toFixed(1)}% ${cmaxPct > 25 ? 'FAIL' : 'OK'}`,
        tmaxPct == null
          ? 'tmax n/a'
          : `tmax sim ${res.tmaxH.toFixed(2)} vs pub ${ref.tmax_h} h → ${tmaxPct.toFixed(1)}% ${tmaxPct > 25 ? 'FAIL' : 'OK'}`,
      ].join(' | '),
    );
  }

  console.log('\nvalidate-pk — approved drugs vs published references\n');
  for (const line of table) console.log('  ' + line);
  console.log(
    '\nReferences carry their source quotes in data/validation.json; rows without one are shown as unvalidated, never filled in from memory. Population-average simulation only.',
  );
  if (failures > 0) {
    console.error(`\nvalidate-pk: ${failures} metric(s) exceeded the 25% band — exit 1`);
    process.exit(1);
  }
  console.log('\nvalidate-pk: every referenced metric is within 25% of its published value.');
}

void main();

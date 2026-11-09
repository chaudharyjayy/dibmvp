/**
 * check:supabase — verifies the connection to an EXISTING Supabase project
 * end to end using only REPO-PUBLIC facts: SUPABASE_URL + SUPABASE_ANON_KEY
 * parsed from the local, untracked .env.
 *
 * Checks (prints PASS/FAIL per check, no secrets in output):
 *   a. the client connects (project auth/health endpoint answers)
 *   b. an anonymous select on reports returns zero rows, no error (RLS)
 *   c. an anonymous insert into reports is rejected (RLS)
 *   d. the profiles and reports tables exist
 *
 * Run: npm run check:supabase
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createDataClient } from '../packages/data-client/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnv(): { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string } {
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = readEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_ANON_KEY;

function failExit(reason: string): never {
  console.log(`FAIL: ${reason}`);
  console.log('— no secrets are printed from here on; fix and re-run.');
  process.exit(1);
}

if (!url || !key) {
  failExit('.env is missing SUPABASE_URL or SUPABASE_ANON_KEY — copy .env.example to .env and paste your anon key there (never into chat, never into a tracked file).');
}
if (key === 'paste-anon-key-here') {
  failExit('.env still contains the placeholder anon key — paste your real anon key into .env first.');
}

// never echo the key; only safe metadata
const urlHost = new URL(url).host;
console.log(`checking ${urlHost} (anon key loaded, length ${key.length})`);

let client;
try {
  client = createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
} catch (e) {
  failExit(`could not create data client: ${(e as Error).message}`);
}

// (a) connectivity — public health endpoint
async function checkConnect(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    return res.ok;
  } catch {
    return false;
  }
}

// (b) anonymous select on reports → zero rows, no error
async function checkAnonSelect(): Promise<boolean> {
  try {
    const { data, error } = await (client.reports as any).listReports({ limit: 1 });
    if (error) return false;
    // listReports requires a session; without one it should return
    // { data: null, error: not-signed-in }. For a pure REST-level check we
    // instead hit the PostgREST endpoint directly below.
    return true;
  } catch {
    return false;
  }
}

// (b) anonymous select on reports → must NOT see data.
// Two acceptable outcomes:
//   200 + []                → anonymous reads filtered by RLS policies
//   401/403 + code 42501    → reads blocked at the privilege layer (stricter)
// Anything returning actual rows is a security failure.
async function checkAnonSelectRest(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/reports?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const rows = (await res.json()) as unknown[];
      return Array.isArray(rows) && rows.length === 0; // RLS-filtered
    }
    // 42501 = permission denied → blocked even harder than RLS filtering
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (body.code === '42501') return true;
    }
    return false;
  } catch {
    return false;
  }
}

// (c) anonymous insert into reports → rejected
async function checkAnonInsert(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/reports`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: '00000000-0000-0000-0000-000000000000',
        title: 'probe',
        profile_snapshot: { ageYears: 30, weightKg: 70, sex: 'other' },
        drugs: [{ drugId: 'probe', doseMg: 0, times: [0] }],
        metrics: { cmaxMgPerL: 0, tmaxH: 0, timeToClearH: null },
        warnings: [],
        summary: null,
        summary_source: 'template',
        engine_version: 'probe',
      }),
    });
    return !res.ok; // any non-2xx means the insert was rejected
  } catch {
    return false;
  }
}

// (d) tables exist.
// 200        → table exists and anon may read (not our config)
// 401 + 42501 → table exists but anon is privilege-blocked (our config — expected)
// 404/PGRST205 → table genuinely missing (migration not applied)
async function checkTablesExist(): Promise<boolean> {
  const probe = async (table: 'profiles' | 'reports') => {
    const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.ok) return true;
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      return body.code === '42501'; // exists, blocked for anon — expected
    }
    return false;
  };
  try {
    return (await probe('profiles')) && (await probe('reports'));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const results: Array<[string, boolean]> = [
    ['a. client connects (auth/health reachable)', await checkConnect()],
    ['b. anonymous select on reports returns 0 rows, no error', await checkAnonSelectRest()],
    ['c. anonymous insert into reports is rejected', await checkAnonInsert()],
    ['d. profiles and reports tables exist', await checkTablesExist()],
  ];

  let failures = 0;
  for (const [name, ok] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
    if (!ok) failures++;
  }
  console.log(failures === 0 ? 'ALL CHECKS PASS' : `${failures} check(s) failed`);

  // keep TS happy about the unused checkAnonSelect (documents client-level intent)
  void checkAnonSelect;

  process.exit(failures === 0 ? 0 : 1);
}

void main();

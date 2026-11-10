/**
 * check:rls — the two-user test the review asked for (REVIEW.md M16).
 *
 * The SQL test file is commented out and the vitest suite only regex-matches
 * its text, so nothing has actually proved that user B cannot read, change or
 * forge user A's data. This script does it against the live project.
 *
 * It needs two real accounts. Create them once in the Supabase dashboard
 * (Authentication → Users → Add user → email + password), then put their
 * credentials in the untracked `.env` — never in a tracked file, never in chat:
 *
 *   RLS_A_EMAIL=...
 *   RLS_A_PASSWORD=...
 *   RLS_B_EMAIL=...
 *   RLS_B_PASSWORD=...
 *
 * Run: npm run check:rls
 *
 * Prints PASS/FAIL per step. Never prints tokens, keys or row contents.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnv(): Record<string, string> {
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = readEnv();
const url = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.log('SKIP: .env needs SUPABASE_URL and SUPABASE_ANON_KEY (see .env.example).');
  process.exit(2);
}

const creds = {
  a: { email: env.RLS_A_EMAIL, password: env.RLS_A_PASSWORD },
  b: { email: env.RLS_B_EMAIL, password: env.RLS_B_PASSWORD },
};
if (!creds.a.email || !creds.a.password || !creds.b.email || !creds.b.password) {
  console.log('SKIP: create two test accounts, then add RLS_A_EMAIL/RLS_A_PASSWORD and');
  console.log('      RLS_B_EMAIL/RLS_B_PASSWORD to .env (never to a tracked file or chat).');
  process.exit(2);
}

async function signIn(email: string, password: string): Promise<{ userId: string; token: string }> {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`sign-in failed for ${email.split('@')[0]}@… (status ${res.status})`);
  }
  const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
  if (!body.access_token || !body.user?.id) throw new Error('sign-in returned no session');
  return { userId: body.user.id, token: body.access_token };
}

const probeRow = (userId: string) => ({
  user_id: userId,
  title: 'rls probe — safe to delete',
  profile_snapshot: { ageYears: 30, weightKg: 70, sex: 'other' },
  drugs: [{ drugId: 'probe', doseMg: 1, times: [0] }],
  metrics: { cmaxMgPerL: 0, tmaxH: 0, timeToClearH: null },
  warnings: [],
  summary: null,
  summary_source: 'template',
  engine_version: 'rls-probe',
});

const rest = (path: string, token: string, init: RequestInit = {}) =>
  fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

async function main(): Promise<void> {
  const a = await signIn(creds.a.email!, creds.a.password!);
  const b = await signIn(creds.b.email!, creds.b.password!);

  // A creates a report.
  const insert = await rest('reports', a.token, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(probeRow(a.userId)),
  });
  const inserted = insert.ok ? ((await insert.json()) as Array<{ id: string }>) : [];
  const reportId = inserted[0]?.id;
  if (!probeRow || !reportId) {
    console.log(`FAIL: user A could not create its own report (status ${insert.status})`);
    process.exit(1);
  }

  const checks: Array<[string, boolean]> = [];

  // 1. B must not read A's report.
  {
    const res = await rest(`reports?id=eq.${reportId}&select=id,title`, b.token);
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    checks.push(["B cannot read A's report", res.ok && Array.isArray(rows) && rows.length === 0]);
  }

  // 2. B must not modify A's report.
  {
    const res = await rest(`reports?id=eq.${reportId}`, b.token, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ title: 'changed by B' }),
    });
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    checks.push(['B cannot update A\u2019s report', !res.ok || (Array.isArray(rows) && rows.length === 0)]);
  }

  // 3. B must not forge a row owned by A.
  {
    const res = await rest('reports', b.token, {
      method: 'POST',
      body: JSON.stringify(probeRow(a.userId)),
    });
    checks.push(["B cannot insert a report owned by A's id", !res.ok]);
  }

  // 4. B must not read A's profile.
  {
    const res = await rest(`profiles?id=eq.${a.userId}&select=id`, b.token);
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    checks.push(["B cannot read A's profile", res.ok && Array.isArray(rows) && rows.length === 0]);
  }

  // 5. A can still read and delete its own row (proves the probe is real).
  {
    const read = await rest(`reports?id=eq.${reportId}&select=id`, a.token);
    const rows = read.ok ? ((await read.json()) as unknown[]) : [];
    const del = await rest(`reports?id=eq.${reportId}`, a.token, { method: 'DELETE' });
    checks.push(['A can read and delete its own report', read.ok && rows.length === 1 && (del.ok || del.status === 404)]);
  }

  let failures = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
    if (!ok) failures++;
  }
  console.log(failures === 0 ? 'ALL CHECKS PASS' : `${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.log(`FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

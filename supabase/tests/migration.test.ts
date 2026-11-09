import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migration = readFileSync(join(repoRoot, 'supabase', 'migrations', '0001_init.sql'), 'utf8');
const sqlChecks = readFileSync(join(repoRoot, 'supabase', 'tests', 'rls_checks.sql'), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe('migration 0001_init.sql', () => {
  it('creates both tables with the specified columns and checks', () => {
    expect(migration).toMatch(/create table public\.profiles/);
    expect(migration).toMatch(/age_years int check \(age_years between 1 and 120\)/);
    expect(migration).toMatch(/weight_kg numeric check \(weight_kg > 0 and weight_kg < 400\)/);
    expect(migration).toMatch(/sex text check \(sex in \('female', 'male', 'other'\)\)/);
    expect(migration).toMatch(/create table public\.reports/);
    expect(migration).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/);
    expect(migration).toMatch(/char_length\(title\) <= 100/);
    expect(migration).toMatch(/summary_source text check \(summary_source in \('ai', 'template'\)\)/);
  });

  it('indexes reports (user_id, created_at desc)', () => {
    expect(migration).toMatch(/create index reports_user_created_idx\s*\n?\s*on public\.reports \(user_id, created_at desc\)/);
  });

  it('enables RLS on both tables', () => {
    expect(migration).toMatch(/alter table public\.profiles enable row level security/);
    expect(migration).toMatch(/alter table public\.reports enable row level security/);
  });

  it('has exactly the 8 own-rows policies, all authenticated-scoped', () => {
    const policies = [...migration.matchAll(/create policy "([^"]+)"\s*\n\s*on public\.(\w+) for (\w+) to authenticated/g)];
    const names = policies.map((m) => m[1]);
    const wanted = [
      'profiles_select_own',
      'profiles_insert_own',
      'profiles_update_own',
      'profiles_delete_own',
      'reports_select_own',
      'reports_insert_own',
      'reports_update_own',
      'reports_delete_own',
    ];
    expect(names).toEqual(wanted);
    // no policy is scoped to anon/public role
    expect(migration.match(/for (?:select|insert|update|delete) to (?:anon|public)\b/g)).toBeNull();
    // all four reports policies use user_id = auth.uid()
    const reportsUsing = migration.match(
      /on public\.reports for (?:select|update|delete) to authenticated\s*\n\s*using \(user_id = auth\.uid\(\)\)/g
    );
    expect(reportsUsing?.length).toBe(3);
    const reportsCheck = migration.match(/on public\.reports for insert to authenticated\s*\n\s*with check \(user_id = auth\.uid\(\)\)/g);
    expect(reportsCheck?.length).toBe(1);
    // same for profiles (own row by id)
    const profilesUsing = migration.match(
      /on public\.profiles for (?:select|update|delete) to authenticated\s*\n\s*using \(id = auth\.uid\(\)\)/g
    );
    expect(profilesUsing?.length).toBe(3);
    const profilesInsert = migration.match(/on public\.profiles for insert to authenticated\s*\n\s*with check \(id = auth\.uid\(\)\)/g);
    expect(profilesInsert?.length).toBe(1);
  });

  it('revokes anonymous access to both tables', () => {
    expect(migration).toMatch(/revoke all on public\.profiles from anon/);
    expect(migration).toMatch(/revoke all on public\.reports from anon/);
  });

  it('creates the sign-up trigger and the 200-report cap trigger', () => {
    expect(migration).toMatch(/function public\.handle_new_user\(\)/);
    expect(migration).toMatch(/after insert on auth\.users\s*\n\s*for each row execute function public\.handle_new_user\(\)/);
    expect(migration).toMatch(/function public\.enforce_report_cap\(\)/);
    expect(migration).toMatch(/create trigger enforce_report_cap_trigger\s*\n\s*before insert on public\.reports/);
    expect(migration).toMatch(/n >= 200/);
  });

  it('never references a client-side privileged key', () => {
    expect(migration.toLowerCase()).not.toContain(['service', 'role'].join('_'));
  });
});

describe('rls_checks.sql', () => {
  it('documents the expected proofs', () => {
    expect(sqlChecks).toMatch(/user A cannot select, update or delete user B's rows/);
    expect(sqlChecks).toMatch(/Anonymous sessions get zero rows/);
    expect(sqlChecks).toMatch(/report cap reached/);
    expect(sqlChecks).toMatch(/pg_policies/);
  });
});

describe('workspace safety: no privileged key references in client code', () => {
  const forbidden = ['service', 'role'].join('_');
  const badPhrase = forbidden.toLowerCase();

  it('fails if the phrase appears anywhere in packages/, apps/, api/, or scripts/', () => {
    const scanned = ['packages', 'apps', 'api', 'scripts']
      .map((d) => join(repoRoot, d))
      .filter((d) => {
        try {
          statSync(d);
          return true;
        } catch {
          return false;
        }
      })
      .flatMap((d) => walk(d))
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|html|css)$/.test(f));
    expect(scanned.length).toBeGreaterThan(0);
    const offenders = scanned.filter((f) => readFileSync(f, 'utf8').toLowerCase().includes(badPhrase));
    expect(offenders).toEqual([]);
  });
});

describe('root config sanity', () => {
  it('.env.example exists with exactly the two documented variables', () => {
    const env = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    const lines = env.split('\n').filter((l) => /^[A-Z]/.test(l));
    expect(lines).toEqual([
      'SUPABASE_URL=https://lhbpkbnbxzseyygpfgeo.supabase.co',
      'SUPABASE_ANON_KEY=paste-anon-key-here',
    ]);
  });
});

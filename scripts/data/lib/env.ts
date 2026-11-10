import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Parse the root .env without exporting anything into the process env. */
export function readRepoEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = readFileSync(join(repoRoot, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env yet */
  }
  return out;
}

/**
 * Server-only Supabase credentials for the data scripts.
 *
 * The admin key bypasses RLS, so it must never reach the browser: the env
 * name is deliberately not NEXT_PUBLIC_*, and a NEXT_PUBLIC_ variant is
 * treated as a configuration error. `scripts/` is not bundled by Next.js.
 */
export function requireWriteCredentials(): { url: string; adminKey: string } {
  const env = readRepoEnv();
  const url = env.SUPABASE_URL;
  const adminKey = env.SUPABASE_ADMIN_KEY;
  if (env.NEXT_PUBLIC_SUPABASE_ADMIN_KEY) {
    throw new Error(
      'Remove NEXT_PUBLIC_SUPABASE_ADMIN_KEY — a privileged key must never be public.'
    );
  }
  if (!url || !adminKey) {
    console.error(
      [
        'SKIP: writing the catalogue needs server-side credentials.',
        '',
        'Add these two lines to /Users/Jayesh/dib/.env (untracked, never commit):',
        '  SUPABASE_URL=...           (already present)',
        '  SUPABASE_ADMIN_KEY=...',
        '',
        'SUPABASE_ADMIN_KEY is the server-only key from the Supabase dashboard',
        '(Project Settings → API keys → the secret/service key, not the anon key).',
        'It bypasses RLS, so it stays server-side only. Then re-run this script.',
      ].join('\n')
    );
    process.exit(2);
  }
  return { url, adminKey };
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

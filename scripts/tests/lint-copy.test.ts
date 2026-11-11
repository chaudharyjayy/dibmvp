import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../lint-copy.mjs', import.meta.url));

/**
 * Proves the linter actually scans the UI. The gap this guards against
 * (REVIEW.md C2): scripts/lint-copy.mjs used to scan packages/api/data/supabase
 * only, so an unsafe sentence in apps/web passed green. Deleting 'apps' from
 * SCAN_DIRS fails this test, and so does dropping the landing directory from
 * the probe list.
 */
describe('lint-copy coverage', () => {
  it('catches a banned phrase in apps/ (incl. the landing page), packages/, docs/ and data/', () => {
    const res = spawnSync(process.execPath, [script, '--selftest'], { encoding: 'utf8' });
    expect(res.status, `stderr:\n${res.stderr}\nstdout:\n${res.stdout}`).toBe(0);
    expect(res.stdout).toMatch(/probe files in \d+ roots were all caught/);
    expect(res.stdout).toContain('apps/web/components/landing/probe.tsx');
  });

  it('passes on the real working tree', () => {
    const res = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(res.status, `stderr:\n${res.stderr}`).toBe(0);
    expect(res.stdout).toMatch(/no banned phrases found/);
  });
});

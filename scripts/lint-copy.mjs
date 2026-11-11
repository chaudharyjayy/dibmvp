#!/usr/bin/env node
/**
 * lint-copy — fails if a banned phrase appears in the product or its docs.
 *
 * Scanned: packages/, api/, data/, supabase/, apps/ (the UI), docs/ and the
 * root README.md / REVIEW.md. Previously apps/web was skipped, so a dosing
 * phrase in the simulator UI passed green (REVIEW.md C2).
 *
 * A line may opt out with the exact comment `lint-copy: allow` — used only
 * where the phrase itself is being quoted as forbidden (e.g. a prompt that
 * tells the model never to say it, or a safety rule in the PRD).
 * Whole files may opt out via ALLOWED_FILES: the review documents, which quote
 * the phrases as findings.
 *
 * `--selftest` writes probe files into a temp tree and asserts that every scan
 * root catches them; scripts/tests/lint-copy.test.ts runs it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');

/** Directories scanned under the repo root. */
export const SCAN_DIRS = ['packages', 'api', 'data', 'supabase', 'apps', 'docs'];
/** Root-level files scanned. */
export const ROOT_FILES = ['README.md', 'REVIEW.md'];
/** Files allowed to quote banned phrases (review artifacts only). */
export const ALLOWED_FILES = ['REVIEW.md', 'docs/REVIEW-PACKET.md'];

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.vercel', '.next', 'coverage',
  // build output + static assets, not copy
  'out', 'build', '.turbo',
  // The label cache holds raw FDA label text. It is upstream source material
  // that we quote, not copy we wrote: a label is allowed to say "recommended
  // dose". It is git-ignored and never shipped.
  '.cache',
]);
const TEXT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|html|css)$/;
const ALLOW_DIRECTIVE = 'lint-copy: allow';

export function loadPhrases(root = defaultRoot) {
  const file = path.join(root, '.banned-phrases');
  const phrases = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'));
  if (phrases.length === 0) {
    throw new Error('.banned-phrases is empty');
  }
  return phrases;
}

/** Returns a list of `{ file, phrase, line }` violations under `root`. */
export function scan(root, phrases = loadPhrases(root)) {
  const violations = [];
  const forbiddenKey = ['service', 'role'].join('_');
  const keyRoots = ['packages', 'apps'].map((d) => path.join(root, d));

  const checkFile = (file) => {
    const rel = path.relative(root, file);
    if (ALLOWED_FILES.includes(rel)) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes(ALLOW_DIRECTIVE)) return;
      const lower = line.toLowerCase();
      for (const phrase of phrases) {
        if (lower.includes(phrase)) {
          violations.push({ file: rel, phrase, line: i + 1 });
        }
      }
      if (keyRoots.some((r) => file.startsWith(r)) && lower.includes(forbiddenKey)) {
        violations.push({ file: rel, phrase: `${forbiddenKey} (privileged key in client code)`, line: i + 1 });
      }
    });
  };

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (TEXT_FILE.test(entry.name)) {
        checkFile(full);
      }
    }
  };

  for (const d of SCAN_DIRS) walk(path.join(root, d));
  for (const f of ROOT_FILES) {
    const full = path.join(root, f);
    if (fs.existsSync(full)) checkFile(full);
  }
  return violations;
}

/** Create a temp tree with one probe per scan root and assert each is caught. */
function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-copy-selftest-'));
  const phrase = loadPhrases()[0];
  const targets = [
    'apps/web/components/probe.tsx',
    'apps/web/components/landing/probe.tsx',
    'packages/engine/probe.ts',
    'docs/probe.md',
    'data/probe.json',
  ];
  for (const t of targets) {
    const full = path.join(tmp, t);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `export const x = "${phrase}";\n`);
  }
  const found = scan(tmp, [phrase]);
  const missed = targets.filter(
    (t) => !found.some((v) => v.file === t.replaceAll(path.sep, '/'))
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  if (missed.length > 0) {
    console.error(`lint-copy selftest: FAILED — not scanned: ${missed.join(', ')}`);
    return 1;
  }
  console.log(
    `lint-copy selftest: OK — probe files in ${targets.length} roots were all caught: ${targets.join(', ')}`
  );
  return 0;
}

if (import.meta.url === url.pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--selftest')) {
    process.exit(selftest());
  }
  let violations;
  try {
    violations = scan(defaultRoot);
  } catch (e) {
    console.error(`lint-copy: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  for (const v of violations) {
    console.error(`lint-copy: banned phrase "${v.phrase}" found in ${v.file}:${v.line}`);
  }
  if (violations.length > 0) {
    console.error(`lint-copy: ${violations.length} violation(s)`);
    process.exit(1);
  }
  console.log('lint-copy: OK — no banned phrases found');
}

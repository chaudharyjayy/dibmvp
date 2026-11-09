#!/usr/bin/env node
/**
 * lint-copy — fails if banned phrases appear anywhere in packages/, api/, or
 * data/, except inside this file and the phrase list itself.
 * Additionally checks the whole workspace except node_modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const phraseFile = path.join(root, '.banned-phrases');

const phrases = fs
  .readFileSync(phraseFile, 'utf8')
  .split('\n')
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean);

if (phrases.length === 0) {
  console.error('lint-copy: .banned-phrases is empty');
  process.exit(1);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel']);
const ALLOWED_FILES = new Set([path.relative(root, phraseFile), path.relative(root, path.join(root, 'scripts', 'lint-copy.mjs'))]);

const scanRoots = ['packages', 'api', 'data', 'supabase'].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));

let violations = 0;

// Client-side packages must never mention a privileged key.
const FORBIDDEN_KEY = ['service', 'role'].join('_');
const FORBIDDEN_SCAN = ['packages', 'apps'].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));

function checkFile(file) {
  if (ALLOWED_FILES.has(path.relative(root, file))) return;
  const text = fs.readFileSync(file, 'utf8').toLowerCase();
  for (const phrase of phrases) {
    if (text.includes(phrase)) {
      console.error(`lint-copy: banned phrase "${phrase}" found in ${path.relative(root, file)}`);
      violations++;
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|html|css)$/.test(entry.name)) {
      checkFile(full);
      const lower = fs.readFileSync(full, 'utf8').toLowerCase();
      if (FORBIDDEN_SCAN.some((s) => full.startsWith(s)) && lower.includes(FORBIDDEN_KEY)) {
        console.error(`lint-copy: ${FORBIDDEN_KEY} reference found in ${path.relative(root, full)} (client code must never use a privileged key)`);
        violations++;
      }
    }
  }
}

for (const dir of scanRoots) walk(dir);

if (violations > 0) {
  console.error(`lint-copy: ${violations} violation(s)`);
  process.exit(1);
}
console.log('lint-copy: OK — no banned phrases found');

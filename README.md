# Drug-in-Body Simulator — engine + data + optional AI summary (MVP)

Functionality layer only (no UI). Pure, framework-free modules that any
frontend can import. Built to the PRD (`docs/PRD.md`) and TRD (`docs/TRD.md`).

## Tree

```text
packages/engine/    PK engine: simulate, closedFormSingleDose, buildReport, lookupInteraction
  tests/            vitest suite + test fixtures (placeholder drug — not real data)
data/               drugs.json (null params until sourced), interactions.json (empty), sources.md
api/summary/        optional Vercel-style AI summary function (template fallback)
scripts/            lint-copy script
docs/               PRD.md, TRD.md
```

## Tests & checks

```bash
npm install
npm run test          # all vitest suites (engine + api)
npm run lint:copy     # copy lint (banned phrases)
```

## Rules encoded in code

- Drug parameters in `data/drugs.json` stay `null` with TODO notes until a
  cited value exists (PK-DB / official labels). Never invented.
- `lookupInteraction` misses return "Not in our small verified set" — never
  "no interaction", never implying safety.
- `buildReport` always carries the fixed disclaimer.
- The AI summary is optional; every reply is verified (numbers ⊆ input, no
  banned phrases) or replaced by a deterministic template.

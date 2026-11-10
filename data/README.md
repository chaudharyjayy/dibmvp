# Data

Two layers, two rules.

## 1. Catalogue — real, from openFDA NDC (CC0)

`public.drugs` (~7.6k ingredients) and `public.drug_products` (~138k products)
in Supabase, loaded by `npm run data:import`. Source:
<https://open.fda.gov/apis/drug/ndc/>. Every product keeps a `source_url`.

`data/drugs.json` remains the tiny, hand-curated file the engine and tests read
locally. It is not the catalogue; it is the short list of drugs with reviewed
parameters.

## 2. Pharmacokinetic parameters — cited, one row at a time

`data/pk-review.csv` (copy from `data/pk-review.example.csv`). Every row needs
a source URL and the quoted sentence. `npm run data:pk:dry` validates;
`npm run data:pk` writes. A drug is simulatable only when all four parameters
are approved.

- `drugs.json` — one object per drug (engine schema). Numeric fields stay `null`
  until a cited value exists: never invent, never paste from memory.
- `interactions.json` — verified pairs with severity, mechanism and a citation
  each; empty until pairs are hand-checked.
- `sources.md` — per-parameter source table plus the interactions field
  reference.

Full workflow and source licensing: `scripts/data/README.md`.

Engine + tests use `packages/engine/tests/fixtures/fixtureDrug.ts`, a clearly
labelled TEST FIXTURE with placeholder numbers, so tests run before real
parameter values exist.

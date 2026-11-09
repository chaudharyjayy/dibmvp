# Data

- `drugs.json` — one object per drug (TRD schema). Numeric fields are `null`
  until a cited value exists: never invent, never paste from memory.
- `interactions.json` — verified interaction pairs with severity, mechanism and
  a citation each; empty until pairs have been hand-checked.
- `sources.md` — per-parameter source table plus the interactions field README.

Engine + tests use `packages/engine/tests/fixtures/fixtureDrug.ts`, a clearly
labelled TEST FIXTURE with placeholder numbers, so tests run before real
parameter values exist.

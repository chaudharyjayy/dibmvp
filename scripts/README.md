# scripts

- `lint-copy.mjs` — copy lint: fails the build if banned phrases
  (`.banned-phrases`) appear anywhere under `packages/`, `api/`, or `data/`,
  except in this script and the phrase list itself.
- `banned-phrases.md` — copy rules summary (also the safe list to keep here).

# Drug data: how the catalogue is built

Two layers, deliberately separated. A large catalogue is easy and honest; a
large parameter set is not, so it is gated by provenance.

## Layer 1 — catalogue (real, large, free)

Source: **openFDA NDC Directory** — <https://open.fda.gov/apis/drug/ndc/>.
Public domain (CC0 1.0). Current snapshot: about 138,000 products, 7,657 unique
ingredients, 4,486 of them oral. Refreshed daily by the FDA.

Written to two tables:

| Table | Rows | Content |
| --- | --- | --- |
| `public.drugs` | ~7.6k | one row per ingredient: name, routes, dosage forms, product counts |
| `public.drug_products` | ~138k | one row per NDC product: brand, labeler, strength, source URL |

Every product row stores `source_url` pointing back at the openFDA query for
that NDC, so any row can be traced to the feed.

```bash
npm run data:import:dry            # parse the cached file, write a preview, no DB
npm run data:import -- --limit 5000  # live sample (needs SUPABASE_ADMIN_KEY)
npm run data:import                # full catalogue
```

The script downloads the 236 MB JSON once into `data/.cache/` (git-ignored) and
caches it. Re-runs upsert on the primary key, so they are idempotent.

### Credentials

`npm run data:import` needs one extra line in the untracked `.env`:

```
SUPABASE_ADMIN_KEY=...
```

That is the server-only secret from the Supabase dashboard (Project Settings →
API keys). It bypasses row-level security. It must never be prefixed
`NEXT_PUBLIC_` and never imported from the web app. The catalogue tables are
read-only for `anon` and `authenticated`; only this script writes.

### What is public

`drugs` and `drug_products` are readable by anyone, because the openFDA
catalogue is CC0. `drug_pk` is not: row-level security exposes only
`status = 'approved'` rows, and the column grant omits `reviewer` and `notes`.
The app reads `drug_pk_public`, a view over those approved rows. A `CHECK`
constraint means an approved row cannot exist without all four parameters, a
dose range, a reviewer and a review date, so the guarantee does not depend on a
script behaving.

## Layer 2 — pharmacokinetic parameters (small, cited, reviewed)

The NDC feed has no ka, F, clearance or volume. Those values come from a
cited source, one row at a time, in `data/pk-review.csv`:

```
cp data/pk-review.example.csv data/pk-review.csv
```

A row is importable only if it has:

- a full `source_url`,
- a `source_quote` of the actual sentence the numbers came from (40+ chars),
- for `status=approved`: all four parameters, a dose range, a `reviewer`, and a
  `reviewed_at` date.

`npm run data:pk:dry` validates without writing. `npm run data:pk` upserts into
`public.drug_pk`; a database trigger then derives `public.drugs.pk_status` from
the rows, so the script cannot leave the status stale. A drug is marked
`reviewed` (simulatable) only when all four parameters are approved. Anything
else stays `partial` or `unsourced` and must be shown as such in the UI.

### Which sources are usable

| Source | Licence | Use |
| --- | --- | --- |
| openFDA labels and NDC | CC0 | names, labels, dosing text, quoted PK sentences |
| DailyMed SPL | public | same, with an SPL set id |
| PK-DB | custom terms | see warning below |
| DDInter | CC BY-NC-SA | interactions only; non-commercial |

**PK-DB warning.** Its code is MIT and its docs are CC BY-SA, but the curated
database has separate terms: attribution plus citation of the original studies,
**coauthorship if more than 10 distinct studies are reused**, and a paid licence
for commercial use. A bulk parameter dump from PK-DB is therefore not a free
option. Read `reference/matthiaskoenig__pkdb/docs/terms-of-use.md` before
importing anything from it.


## One citation per value (migration 0003)

`data/pk-review.csv` holds one row per drug: its four parameters, its dose
range and one document. That is enough to say where a row came from, but not
enough to say which document backs *which* number — and the numbers do not all
come from the same place. So each value also has its own citation in
`data/pk-parameters.csv`:

```text
drug_id,parameter,value,source_url,source_quote,source_title,source_kind,population,route,...
```

The database enforces it. `drug_pk_parameter` holds one row per parameter, and
a trigger refuses to let a row be approved unless every value it carries has a
citation row with the same value:

```text
cannot approve caffeine: no citation row with the same value for ka_per_h
```

The app reads `drug_pk_citations`, a view that only exposes an approved drug's
citations — reviewer names and review dates stay on the service side, and a
drug with no approved row has no citations to show.

Where a review row's quote names several parameters at once ("clearance and
volume of distribution were ..."), the importer uses that quote for each of
them and marks it `paper` or `label`. Where the quote does not mention a
parameter, the row's document is still recorded for it, marked `other` — the
value is not unsourced, but the app can tell it apart from a value with its own
sentence.

### Licences matter here

A value can be perfectly correct and still not be usable. The sources in play:

| Source | Licence | Usable commercially |
| --- | --- | --- |
| openFDA (labels, NDC) | CC0 1.0 | yes |
| DailyMed SPL (FDA labelling) | US government service | yes |
| PubMed Central articles | **per article** — CC BY, CC BY-NC or CC BY-NC-ND | check the article |
| StatPearls (NCBI Bookshelf) | CC BY-NC-ND 4.0 | **no** — non-commercial, no derivatives |
| Europe PMC | API only; the article's own licence applies | as above |
| MyChemDB | NCBI account and terms acceptance | as agreed |

The rows currently approved cite PMC9232434 (CC BY-NC 4.0), PMC283758
(CC BY-NC 4.0), a Springer article, PMID 428185 and PMID 6832208, plus
PMC11593559 and PMC12954933 (both CC BY 4.0) and two DailyMed labels. **The
NC-licensed rows need a decision before the app is used commercially.**

### Checking that a citation still holds

`npm run data:refresh` fetches every citation and looks for the quoted
sentence in the document it points at. It distinguishes three outcomes:

- the quote is there — the citation holds;
- the quote is *not* there — the citation has rotted, and `--apply` demotes the
  drug out of "reviewed" so the simulator stops serving a number nobody can
  check;
- the publisher would not serve the page — **unverifiable**, which never
  demotes anything, because a blocked fetch says nothing about the citation.

PubMed pages are behind a bot interstitial, so their abstracts are fetched from
Europe PMC instead. A quote transcribed from a PDF is matched on substance
rather than on characters: the same words with tidied punctuation still counts,
a reworded sentence does not.

The refresh also regenerates `data/drugs.json` from the database, so the
repository's copy of the drug data tracks the backend instead of being
maintained by hand, and it is scheduled daily:

```bash
npm run data:refresh              # verify citations, regenerate drugs.json
npm run data:refresh -- --deep    # also re-fetch labels and re-extract candidates
npm run data:refresh -- --apply   # demote drugs whose citation failed
```

The schedule is `scripts/data/refresh-pk.plist`, installed as
`sh.aidevops.dib-pk-refresh` (a launchd agent, daily at 06:23).

## What this deliberately does not do

- It does not fill a parameter because a screen looks empty.
- It does not infer PK values from prose automatically. Text extraction can
  suggest candidates, but a human must paste the quote and approve the row.
- It does not import interactions. `data/interactions.json` stays empty until
  pairs are hand-checked against a citation.

## The label pipeline (candidates only)

Four scripts turn FDA labels into *candidates* for a human to check. None of
them can approve anything, and none of them write `data/interactions.json`.

```bash
npm run data:labels                  # fetch labels, cache the raw text
npm run data:pk:candidates           # read the cached labels, extract PK candidates
npm run data:interactions:candidates # read the interaction sections, find pairs
npm run data:compare                  # what we hold vs what the labels gave us
npm run data:pk:verify                # check every PK row's citation supports its quote
```

| Script | Writes | What it does |
| --- | --- | --- |
| `fetch-labels.ts` | `data/.cache/labels/` (git-ignored) | Searches openFDA for one label per drug, rejects combination products, and checks the DailyMed set id really exists. The citation is the DailyMed page; openFDA is the machine-readable mirror. |
| `extract-pk.ts` | `data/pk-evidence.csv`, `data/pk-review.candidates.csv` | Pulls the pharmacokinetic sentences out of the label, including its numeric tables, and records the exact sentence each value came from. Every row is `pending` with no reviewer. |
| `extract-interactions.ts` | `data/interactions.candidates.csv` | Finds drugs from our own catalogue that a label's interaction section mentions, with the sentence and a suggested severity. |
| `compare-coverage.ts` | `data/coverage-report.md` | Compares the engine list, the catalogue, the labels and the database, and says what each drug still lacks. |
| `withdraw-unverified-pk.ts` | `public.drug_pk` | Fetches every row's citation and checks the quoted sentence is actually in it. A row whose citation does not support it is demoted to `pending`; nothing is ever approved or deleted. |

### What the labels actually contain

Checked on the four drugs in the engine list, with the values an oral one-
compartment model needs:

| | ka | F | CL | V |
| --- | --- | --- | --- | --- |
| acetaminophen | no | no | 0.27 L/h/kg (adults, label table) | 0.8 L/kg (adults, label table) |
| ibuprofen | no | no | CL/F only, which is not clearance | 0.12 L/kg (adults) |
| caffeine | no | "not fully examined" | no | 0.6 L/kg (adults) |
| aspirin | no | 50–75% of the dose reaches circulation | qualitative only | 10 L (total) |

So **no label states an absorption rate constant**, and most state a parameter
or two. The candidates therefore have nulls, and that is the truth rather than
a gap in the parser. A dose range is not extracted at all: it is read from the
label by a human.

### Why combination products are rejected

openFDA's `generic_name` holds the whole ingredient list of a product, so
searching "caffeine" returns aspirin/caffeine tablets and searching
"acetaminophen" returns hydrocodone/acetaminophen capsules. Their clinical
pharmacology section describes a different drug. `fetch-labels.ts` only accepts
a label whose every substance is the drug being sourced (a salt counts as the
same drug).

### Names are normalised, everywhere

"paracetamol" (our engine list), "acetaminophen" (US labels and the catalogue)
and "Acetaminophen (paracetamol)" (a display name) are one substance.
`scripts/data/lib/names.ts` maps them to one form, so a drug does not look like
two drugs and a pair of names does not become an interaction with itself. The
catalogue id is also what `drug_pk.drug_id` must be, because it is a foreign
key to `public.drugs.id`.

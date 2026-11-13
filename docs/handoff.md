# Machine handoff

Everything needed to work on this repo from a second machine: what the repo
contains, which values are deliberately outside it, how to get the data back,
and what is open.

## Repository

- Remote: `https://github.com/chaudharyjayy/dibmvp.git`
- Branch: `main` (the only branch; `origin/-nemo` was deleted after PR #1)
- Last commit: `7d616a1` — merge of PR #1, the procedural brain inside the glass
  figure
- Tree was clean and fully pushed at the time of writing

```bash
git clone https://github.com/chaudharyjayy/dibmvp.git
cd dibmvp
npm install
```

## Environment values

The values are **not** in the repository. `.env` and `apps/web/.env.local` are
gitignored, and the service-role key must never be committed or shipped to a
browser bundle. Copy the two files from the first machine, or read the values
from the Supabase dashboard (Project Settings → API) and type them in.

| Variable | File | Used by | Notes |
| --- | --- | --- | --- |
| `SUPABASE_URL` | `.env` | `check:supabase`, `data:import`, `data:pk`, `check:rls` | Project `lhbpkbnbxzseyygpfgeo` |
| `SUPABASE_ANON_KEY` | `.env` | server scripts | Public by design, still not committed |
| `SUPABASE_ADMIN_KEY` | `.env` | `data:import`, `data:pk` | Service role. Server-side scripts only |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | `apps/web` browser bundle | Must be `NEXT_PUBLIC_` to reach the client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | `apps/web` browser bundle | Same key as above, different name |
| `RLS_A_EMAIL` / `RLS_A_PASSWORD` | `.env` | `check:rls` | Two real accounts the owner creates |
| `RLS_B_EMAIL` / `RLS_B_PASSWORD` | `.env` | `check:rls` | `check:rls` skips with a message until these exist |

`apps/web/.env.local` is the only file the web app reads; `.env` at the root is
for the scripts. Both are needed for the full set of checks.

## Data

Two layers, and they are not the same thing.

**Catalogue — real, in Supabase.** `public.drugs` (~7.6k ingredients) and
`public.drug_products` (~138k products), loaded by `npm run data:import` from
the openFDA NDC dump (CC0). Every product keeps a `source_url`. Migration:
`0002_drug_catalog.sql`. Re-import from scratch:

```bash
npm run data:import:dry   # reports what it would write
npm run data:import
npm run check:drugs
```

The importer fetches `https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json`
directly, so a new machine does not need a local copy of the dump.

**Parameters — cited, one value at a time.**
`data/pk-review.csv` and `data/pk-parameters.csv` hold the review sheets:
one row per drug and one row per parameter, each with the URL and the quoted
sentence that states that value. `public.drug_pk_parameter` holds the same in
the database and a trigger refuses to approve a row whose values have no
citation of their own; `public.drug_pk_citations` is the view the app reads.
Six drugs are approved and simulatable, all three of the engine's included:
acetaminophen (ka 3.47, F 0.86, CL 0.343, V 0.621 L/kg), ibuprofen (ka 1.54,
F 0.94, CL 0.0541, V 0.15 L/kg) and caffeine (ka 19.8, F 0.99, CL 0.09,
V 0.6 L/kg), plus amoxicillin, atenolol and gabapentin.

`npm run data:refresh` re-fetches every citation and checks the quoted
sentence is still in the document, then regenerates `data/drugs.json` from the
database so the repository's copy of the drug data tracks the backend. It runs
daily as the launchd agent `sh.aidevops.dib-pk-refresh`
(`scripts/data/refresh-pk.plist`).

**Licences.** openFDA is CC0 and DailyMed is US government, so both are free
to use. The papers are not uniform: some are CC BY, some CC BY-NC, and
NCBI's StatPearls is CC BY-NC-ND, which forbids commercial use. The approved
rows currently cite PMC9232434 and PMC283758 (both CC BY-NC) — those need a
decision before the app is used commercially. `scripts/data/README.md` lists
the licence of every source in play.

**Local snapshot, not in the repo.** `/Users/Jayesh/drugs-schema/` holds the
migration SQL, the import scripts, a catalogue preview and the 88 MB
`drug_products.json`. It is a cache of the openFDA dump plus the applied
migration; re-importing from source reproduces it. Copy it only if the second
machine has no network access to openFDA.

## State at handoff

The landing page is direction C, "HUD" — a dark instrument panel with a
cyberpunk / medical-scanner look. Its palette, the three devices it uses and
the rules it is held to are in `docs/DESIGN.md`. The backdrop (gradient, two
glows, hairline grid, scanlines, vignette) is generated in CSS: the page still
ships no images and no video. The simulator and the other routes keep the
light theme; the fixed disclaimer is dark on every route.

Landing rebuild, steps 1–6, is complete on `main`, and the procedural brain
sits inside the glass head (PR #1). After that, the in-code figure was replaced
by the Blender anatomy model (`32f90e5` for the export pipeline, then the
scene commit on top):

- Source: `assets/anatomy/human_anatomy.blend` (+ `assets/anatomy/anatomy.py`,
  the script that builds it). The meshes it reads come from BodyParts3D and
  are fetched, not committed: `scripts/anatomy/fetch-meshes.sh`. See
  `assets/anatomy/README.md` for the licence and the node-name contract.
  Export: `scripts/anatomy/export-web.py` →
  `apps/web/public/models/human_anatomy.glb`.
- Budget: ~114k triangles, ~2.1 MB. Replaces the generated lathe figure
  (was ~11k triangles). `geometryTriangles` in `getStats()` reports the GLB's
  count.
- The brain is 35 named gyri and 27 named nuclei, one mesh each, so pointing
  at the figure says which gyrus is under the pointer and which lobe it
  belongs to (`brain-regions.ts`). The names come from the database's own
  parts list, so the readout is anatomical rather than a guess.
- The GLB has no digestive tract, so `stomach` and `gut` have no mesh to tint.
  Phase 01 (absorption) is carried by the particles leaving the abdominal
  source; the liver, lungs, heart, kidneys and the vessels carry the blood /
  kidney-lag level. If the absorption phase must show an organ, the model
  needs a gut added in Blender, or the caption has to say it is not shown.
- The body is the model's mesh with the same Fresnel shader as before; brain is
  now the model's brain (rim shader), no longer a procedural one.

| Step | Commit | Content |
| --- | --- | --- |
| 1 | `37c4b71` | White shell, design tokens, Geist type, header, footer, copy lint |
| 2 | `a90bcd2` | Code-generated glass figure, turning, throttle, pause |
| 3 | `671d654` | Illustrative dial curve, dial strip, 600 particles |
| 4 | `5502c9a` | Pinned scroll sequence, three phases, end CTA |
| 5 | `f5ede21` | Mobile layout, reduced motion, CSS load sequence |
| 6 | `c7c382f` | Landmarks, skip link, canvas/slider semantics, real focus rings |

Plus `0fb35a3` (deleted two unused components) and PR #1 (`7d616a1`, the
procedural brain inside the figure's head, `brain-geometry.ts`).

## Open work

1. **Simulator drug search.** The catalogue is in Supabase but the simulator UI
   still uses a hardcoded `exampleDrug`; nothing searches `public.drugs` yet.
2. **Real PK rows.** Replace the placeholder rows in `data/pk-review.csv` with
   cited label values for caffeine, paracetamol/acetaminophen and ibuprofen.
   Every row needs a source URL and the quoted sentence.
3. **Two-user RLS test.** Blocked on the two accounts and their env vars above.

## Verification

```bash
npm test              # vitest, all workspaces
npm run lint:copy     # banned-phrase gate
npm run build:web     # also the only typecheck that covers apps/web
npm run check:drugs   # catalogue counts in Supabase
npm run check:supabase
npm run check:rls     # skips until the two accounts exist
npm run data:pk:dry   # validates pk-review.csv without writing
```

`npm run typecheck` at the root does **not** cover `apps/web`; use
`npm run build:web` for that.

## Toolchain notes

- Node `v26.12.1`, npm `11.20.0`, npm workspaces `packages/*` and `apps/*`.
- Dev server: `npm run dev:web` (port 3000).
- Registry scripts need `python3.12`; the system `python3` is 3.9.
- `gh` is installed via Homebrew. Auth in this environment goes through
  `GH_TOKEN` from the git keychain rather than an interactive `gh auth login`.
- The web app is a Next.js app with a Turbopack dev server. `next build` shares
  `.next` with `next dev`, so a build while dev is running can leave dev serving
  a stale CSS chunk; restart dev if a style change does not appear.

## Deliberately outside the repository

- `.env` and `apps/web/.env.local` — real keys.
- The service-role/admin key, in any form.
- The local openFDA snapshot.
- Local agent state: `~/.aidevops/.agent-workspace/` and claude-mem observations.

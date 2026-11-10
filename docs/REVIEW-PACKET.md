# Review packet — dib (Drug-in-Body Simulator)

**Purpose.** A single self-contained file an independent reviewer (e.g. Claude) can read without
access to the original chat session. It contains: the project context the review was commissioned
with (Part A), the exact checks that were run and their results (Part B), every review agent and the
exact prompt it was given (Part C), the findings those agents produced (Part D), what was added to
the repo (Part E), and the decisions still open (Part F).

**Status.** Review only. No product code was changed. `REVIEW.md` is the deliverable; this file is
the evidence pack behind it.

**How to review this.** Read Part A first, then `REVIEW.md` §3 (the ranked findings). Use Part C to
judge whether the right questions were asked, and Part D to judge whether the answers hold. If you
think a finding is wrong, say so — Part D separates what was measured from what was a judgement
call, and the judgement calls are the fair targets.

> **Lint caveat.** This file quotes banned phrases on purpose (they are the phrases the project
> forbids). `scripts/lint-copy.mjs` does not currently scan `docs/`, but `REVIEW.md` §8 step 0
> proposes making it do so. When that change lands, this file and `REVIEW.md` must be added to the
> linter's allow-list, or the quotes in them will fail the build.

---

# Part A — Project context (verbatim)

This is the context the review was commissioned with. It is reproduced in full and unedited apart
from the removal of the trailing instruction header formatting.

---

## OPENCODE_CONTEXT.md: Drug-in-Body Simulator (dib)

Read this whole file first. Then run the review in section 9. Do not change code until you have posted your review and I have approved it.

### 1. What this project is

dib is a web app where a user enters a patient profile (age, sex, height, weight, and later records and conditions), picks a drug and doses, and sees how the drug behaves over time with a time dial. A 3D body view will later show where the drug is acting.

Today it is an **educational simulator**. It is not a medical device and gives no dosing advice.

#### Long-term vision (roadmap, not built)
A doctor loads a patient's data, tests a drug against a disease, and sees the outcome over hours in minutes, instead of trying doses one visit at a time. Pitch framing agreed with the owner, three layers:

1. **Patient and drug levels:** BUILT. Being validated against published human PK curves (target about 20% error on peak level and half-life for the first 3 drugs, results published either way).
2. **Disease response:** NEXT. One disease first, chosen because a published model and data already exist. A separate model is needed per disease-drug pair; no general version exists.
3. **Many diseases and drugs:** long-term platform; needs clinical and pharmacology partners and clinical validation.

### 2. Honesty rules (important)

The owner once drafted pitch claims that were not true and then retracted them. These must **never** appear in the UI, copy, README, pitch text or comments:

- "68 percent accuracy" or any accuracy figure that has not been measured.
- "20,000 drugs" or "5,000 drugs" or any drug-count claim. Real drugs with sourced parameters: currently zero.
- Data "from testing agencies" or any dataset we do not actually hold with permission.
- Rat testing, doctor-usage studies or clinical validation. None has been done.
- That the 3D model or the disease layer is finished. Neither exists yet.
- That the tool predicts allergies. It models drug concentration only.
- That the tool shows whether a drug works on a disease. It does not.

Also: hydroxychloroquine was not a successful COVID treatment (large randomized trials found no meaningful benefit). Do not use it as a success example.

### 3. Regulation and privacy

- Using this to choose a dose for a real patient would make it clinical decision-support software, which may be regulated as a medical device (India: check CDSCO). Not in scope now.
- Health data falls under privacy law (India: DPDP Act). Store only what the engine needs.
- Any doctor-style demo uses **synthetic patients only**.

### 4. Repo and stack

- Repo: github.com/chaudharyjayy/dibmvp (branch main); local path /Users/Jayesh/dib
- Monorepo with npm workspaces: packages/*, apps/*, api/, supabase/, scripts/
- TypeScript strict, vitest, zod
- `packages/engine`: framework-free PK engine. RK4 solver, one-compartment closed form (ka close to ke handled). Two-compartment throws "not implemented yet".
- `data/drugs.json`: ALL drug parameters are intentionally null with TODOs. `interactions.json` is a small verified set.
- `api/summary`: Vercel-style serverless AI summary. Strict zod input, number-grounding check, banned-phrase check, template fallback, 20 req/min/IP, CORS allow-list. Local: `npm run dev:summary` (port 3001).
- `packages/data-client`: framework-free Supabase layer (supabase-js v2). Never reads process.env; the caller passes URL and anon key. Every request is validated. Helpers return `{ data, error }`.
- `supabase/migrations/0001_init.sql`: profiles and reports tables, 8 own-rows RLS policies, REVOKE ALL from anon, signup trigger, 200-report cap.
- `apps/web`: Next.js 16, Tailwind v4, React 19, shadcn. Routes: `/` (landing with animated "dib" hero and AuthPanel) and `/demo`. The `/simulator` route is the next build.

#### Backend status (verified)
- Supabase project: https://lhbpkbnbxzseyygpfgeo.supabase.co (Postgres 17)
- `npm run check:supabase`: 4 of 4 PASS. Real email sign-up worked; the profile row was created by the trigger.
- The migration was applied through the management API, not `supabase db push`, so migration history is unrecorded. Before linking the CLI, run `supabase migration repair` or push will try to re-apply 0001.
- Email provider enabled. Google provider NOT enabled.
- 77 of 77 tests pass.

### 5. Secrets and safety rules

- Real keys live only in untracked `.env` and `apps/web/.env.local`. Only `.env.example` is tracked.
- Never use or mention a service-role key in client code. Tests and `npm run lint:copy` fail if the literal appears in packages/ or apps/.
- Never write real keys, drug parameters, interaction pairs or citations that were not provided or sourced.
- Never log profile or report contents.
- Banned phrases live in `.banned-phrases` ("safe dose", "recommended dose", "you should take", and others). Interaction misses must say "Not in our small verified set", never "no interaction" or "safe".
- The fixed disclaimer must stay visible: "Educational simulator. Population-average estimate. Not medical or dosing advice."

### 6. Reference repos to pull (read-only)

Clone these into `reference/` (add `reference/` to .gitignore). They are for **study and cross-checking only**. Do not copy code into this repo. Check each licence first.

| Area | Repo | Licence note |
| --- | --- | --- |
| PK modelling | https://github.com/Open-Systems-Pharmacology/PK-Sim | GPLv2; do not copy code |
| PK modelling | https://github.com/Open-Systems-Pharmacology/Suite | GPLv2 family; R package for batch runs |
| PK modelling | https://github.com/DavAug/chi | Python PKPD/PBPK; check licence |
| PK modelling | https://github.com/kestrel99/pmxTools | Closed-form 1-3 compartment formulas, good for unit tests |
| PK modelling | https://github.com/benjaminrich/linpk | Repeated-dose profile reference |
| PK modelling | https://github.com/peytoncchen/PK-Visualization | UI and plotting ideas |
| PK modelling | https://matthiaskoenig.github.io/pkpdsim (docs) | PBPK building blocks in SBML; post-MVP |
| PK data | https://github.com/matthiaskoenig/pkdb | Code LGPL-3.0; data has its own terms of use |
| OSP DDI examples | https://github.com/Open-Systems-Pharmacology/Erythromycin-Alfentanil-DDI | Validated interaction models; also Probenecid-Furosemide-DDI, itraconazole-felodipine-ddi |
| Interactions | https://github.com/biothings/DDInter | Data is CC BY-NC-SA 4.0 (non-commercial); attribute |
| Interactions | https://github.com/B2707/umraa | Cited, verifier-gated drug-safety design reference |
| Interactions | https://github.com/indiser/Rxcheck | openFDA ingestion and rules table pattern |
| Interactions | https://github.com/pcmedsinge/fhir-mcp-suite | MCP drug lookup, interaction and dose checks via RxNav |
| Drug data | https://github.com/mims-harvard/TDC | ADMET and DDI datasets; later use |
| Agents and skills | https://github.com/snap-stanford/biomni | Heavy; reference only |
| Agents and skills | https://github.com/K-Dense-AI/claude-scientific-skills | DrugBank, ChEMBL, TDC, RDKit skills |
| Agents and skills | https://github.com/jaechang-hits/SciAgent-Skills | Includes a DDInter skill |
| Agents and skills | https://github.com/anthropics/life-sciences | Official marketplace of life-science MCP servers and skills |
| Agents and skills | https://github.com/anthropics/skills | Skill-format reference |
| MCP servers | https://github.com/Augmented-Nature/ChEMBL-MCP-Server | Compound and ADMET lookups |
| MCP servers | https://github.com/Augmented-Nature/OpenFDA-MCP-Server | Labels and adverse events |
| MCP servers | https://pypi.org/project/medical-mcps/ | Unified MCP for ChEMBL, OpenFDA, PubMed and more |
| Body view | https://github.com/giavinh79/react-body-highlighter | Muscle map, not organs; interaction pattern only |
| Body view | https://github.com/lahaxearnaud/body-highlighter | Framework-free version |

Write a short `reference/NOTES.md` after cloning: for each repo, its licence, last commit date, and one line on what is useful here. Flag any repo that is archived, unlicensed or stale.

### 7. Agents to use

Use every available subagent and skill that fits. Suggested roles (all read-only unless stated):

1. **Engine reviewer:** checks the PK math, units, edge cases (zero or negative inputs, very large ka, no clearance within the window), and test quality. Compare against pmxTools closed forms.
2. **Safety and copy reviewer:** scans all UI text, comments, README, landing copy and API prompts against section 2 and `.banned-phrases`. Reports any claim we cannot back.
3. **Security and RLS reviewer:** verifies RLS policies, the anon grants, the key-leak scanners, CORS, rate limiting, and that no secret or health data is logged or committed. Includes git history.
4. **Frontend reviewer:** checks apps/web for accessibility, mobile layout, error and empty states, and that nothing implies medical advice.
5. **Repo researcher:** clones the section 6 repos, fills `reference/NOTES.md`, and recommends what to borrow as an idea.
6. **Parameter sourcer (candidates only):** for caffeine, paracetamol and ibuprofen, finds ka, F, CL, V and label dose ranges with a citation for each, using PK-DB, drug labels and papers. It must return candidates with sources. A human approves before anything enters `data/drugs.json`. If a value has no source, leave it null.
7. **Interaction verifier (candidates only):** checks candidate drug pairs against DDInter and label text, returning severity, mechanism and citation. Human approval required.

### 8. Decisions and open items

- Staying web-only. A desktop build (Electron) was considered and dropped for now.
- MVP has accounts and saved reports via Supabase. Signed-out use must work.
- Landing page: the owner is still deciding the final direction. Do not redesign it until told.
- Open: which disease goes first for layer 2.
- Open: which two extra drugs join caffeine, paracetamol and ibuprofen.
- Planned: Blender body exported as GLB, shown with three.js, replacing the SVG body view in the TRD.
- Planned: doctor-style demo using synthetic patients, with kidney and liver inputs and side-by-side dose comparison.
- Not built: two-compartment engine, disease models, 3D body, real drug parameters, measured accuracy.

### 9. Your task now: review first, change nothing

1. Read docs/PRD.md and docs/TRD.md, then this file.
2. Run `npm test`, `npm run lint:copy`, `npm run typecheck`, `npm run check:supabase` and the Next.js build. Report results.
3. Pull the section 6 repos into `reference/` and write `reference/NOTES.md`.
4. Run the section 7 reviewers.
5. Produce `REVIEW.md` with:
   - what is solid,
   - bugs and risks, ranked by severity,
   - any place the code or copy conflicts with this file,
   - gaps against the PRD and TRD,
   - a proposed order of work for the next milestone (the `/simulator` screen, using a clearly labelled demo drug while real parameters are null).
6. Stop and wait for approval before making changes.

### 10. Style

Explain results in plain words. The owner is early in their technical journey, so avoid jargon, define terms you must use, and give exact click-by-click or command steps for anything that needs manual action. Never ask for keys in chat.

---

## A11. Owner requirements added in-chat (not in the context file)

These were given conversationally during the build and are binding:

- Landing page: white background, premium feel, no video, no images, no vignette. The human element
  must be generated in real time with code, rotate slowly, and be clickable/turnable with a visible
  directional affordance.
- Navigation must be exactly: "Home", "How does this work", "About us".
- The owner cannot read images or screenshots; every piece of feedback must be textual.
- Real keys live only in untracked env files; never pasted into chat.
- The demo drug on `/simulator` is a synthetic fixture; `data/drugs.json` stays all-null until cited
  sources are approved.

---

# Part B — Verification actually run

All commands run from `/Users/Jayesh/dib` on 2026-11-10, branch `main` at `a286dc1`.

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 5 files, 77/77 tests, 194 ms |
| `npm run lint:copy` | **Pass** — `lint-copy: OK — no banned phrases found` |
| `npm run typecheck` | **Pass** — exit 0, no output |
| `npm run check:supabase` | **Pass** — `ALL CHECKS PASS` (4/4) |
| `npm run build:web` | **Pass** — 8 routes |

Raw `npm test` tail:

```
 ✓ supabase/tests/migration.test.ts     (10 tests)  10ms
 ✓ packages/data-client/tests/validation.test.ts (18 tests) 3ms
 ✓ api/summary/tests/summary.test.ts    (13 tests)  3ms
 ✓ packages/engine/tests/engine.test.ts (16 tests)  9ms
 ✓ packages/data-client/tests/mock-client.test.ts (20 tests) 5ms
 Test Files  5 passed (5)
      Tests  77 passed (77)
```

Raw `check:supabase` output:

```
checking lhbpkbnbxzseyygpfgeo.supabase.co (anon key loaded, length 208)
PASS: a. client connects (auth/health reachable)
PASS: b. anonymous select on reports returns 0 rows, no error
PASS: c. anonymous insert into reports is rejected
PASS: d. profiles and reports tables exist
ALL CHECKS PASS
```

Built route list:

```
○ /            ○ /about        ƒ /api/summary    ○ /demo
○ /how-it-works ○ /signin      ○ /simulator      ○ /_not-found
```

**Important interpretation.** All five checks pass, but `lint:copy` passing is misleading: it does
not scan `apps/web` (finding C2). A green lint run is therefore not evidence that the UI copy is
clean.

---

# Part C — Review agents used

Four read-only subagents ran, two at a time in parallel; the fifth role (repo researcher) was done
inline by the main agent. Parameters sourcer and interaction verifier were **not** run — both
require human approval of sources, and no candidate values were requested yet.

| # | Role | Context §  | Mode | Output used in |
| --- | --- | --- | --- | --- |
| 1 | Engine / PK reviewer | §7.1 | read-only | `REVIEW.md` §2, §3 (H1, H2, H3, M1–M5), §5 |
| 2 | Safety and copy reviewer | §7.2 | read-only | `REVIEW.md` §3 (C1, C2, C7–C9), §4 |
| 3 | Security and RLS reviewer | §7.3 | read-only | `REVIEW.md` §3 (C3, H4, H5), §7 |
| 4 | Frontend reviewer | §7.4 | read-only | `REVIEW.md` §3 (C4, H9, H10, M11–M14), §5 |
| 5 | Repo researcher | §7.5 | inline clone + notes | `reference/NOTES.md`, `REVIEW.md` §6 |

---

## C1. Engine reviewer — exact prompt

> READ-ONLY code review. Do not modify any file, do not run git commands that write, do not install anything. Repo: /Users/Jayesh/dib.
>
> You are the PK engine reviewer for a TypeScript pharmacokinetics simulator. Files to review:
> - /Users/Jayesh/dib/packages/engine/*.ts (simulate.ts, closedFormSingleDose.ts, buildReport.ts, lookupInteraction.ts, types.ts, index.ts)
> - /Users/Jayesh/dib/packages/engine/tests/engine.test.ts and tests/fixtures/fixtureDrug.ts
> - /Users/Jayesh/dib/data/drugs.json, /Users/Jayesh/dib/data/interactions.json
> - /Users/Jayesh/dib/docs/TRD.md section "Pharmacokinetic model" and "Validation and testing"
>
> Check:
> 1. Mathematical correctness of the one-compartment oral model and the closed-form solution, including the ka≈ke limit. Verify units (mg, L, L/h, 1/h, mg/L) are consistent.
> 2. RK4 integration correctness: dose-event handling between steps, step clamping at tEnd, mass balance (absorbed = body + eliminated), accumulation on repeated doses.
> 3. Edge cases: dose at t=0, dose beyond tEnd, dose exactly at a step boundary, zero dose, CL=0, very large ka relative to dt, ka<ke vs ka>ke, tEnd not a multiple of dt, negative/NaN inputs, weight scaling.
> 4. Whether the closed-form reference used in tests is genuinely independent of the RK4 implementation (i.e. would it catch a sign error).
> 5. Test quality: what is actually asserted, what important cases are missing, whether any test is tautological or asserts the implementation against itself.
> 6. Any behavior that could mislead a user (e.g. Cmax/Tmax/timeToClear definitions, warnings, per-kg scaling assumptions).
>
> You may run read-only commands such as `cd /Users/Jayesh/dib && npx vitest run packages/engine` and small throwaway node/python calculations in the system temp dir, but do not modify the repo.
>
> Return a concise markdown report with: (a) 3-6 things that are solid with evidence, (b) findings ranked CRITICAL / HIGH / MEDIUM / LOW, each with file:line, what is wrong, the concrete failure scenario, and a suggested fix, (c) test gaps, (d) any claim in docs that the code does not support. Cite exact line numbers. Do not speculate about code you did not read.

**What it returned (condensed).** Engine maths and units correct; the analytic oracle is genuinely
independent of RK4 (it would catch a sign error); mass balance and superposition hold. Findings,
several of them *measured* by running the real modules:

- `Number.isNaN` instead of `Number.isFinite` is the only validation guard. Measured: `tEndH:
  Infinity` never returned (ran 4 s); `dtH: NaN` → `tH:[0,NaN]`; `weightKg: Infinity` → all-NaN
  curve reported as `cmax 0`.
- `F` silently defaults to `1.0` while `ka`, `V`, `CL` throw when null.
- The closed-form reference truncates its time grid (`round(tEnd/dt)`) while `simulate()` clamps to
  `tEnd`. Measured with `tEnd=1, dt=0.3`: reference ends at 0.9 h, Cmax ~5% low, Tmax 0.9 vs 1.0.
- No RK4 stability guard. Measured: `ka=60, dt=0.05` → `2.4e68` in the gut depot; `ka=100` → `NaN`;
  any `ka ≥ 5.6 h⁻¹` with `dt=0.5` breaks.
- `Cmax/Tmax/timeToClear` are whole-window and grid-sampled; on repeated dosing the report can say
  "Tmax 50.25 h" or report a clear time while another dose is still scheduled.
- `route: 'iv'` is simulated as oral (measured: fake absorption peak at 2.3 h).
- `buildReport` replaces engine warnings instead of merging them.
- Docs mismatch: TRD claims CL is *not* weight-scaled, but the code scales it, so `ke` is
  weight-invariant and Cmax ∝ 1/weight. TRD's data-schema example uses `"ka_per_h": 0, "F": 0`
  placeholders, contradicting the all-null rule.

## C2. Safety and copy reviewer — exact prompt

> READ-ONLY review. Do not modify any file. Repo: /Users/Jayesh/dib.
>
> You are the safety and copy reviewer for an educational drug simulator. Read these first: /Users/Jayesh/dib/docs/PRD.md, /Users/Jayesh/dib/docs/TRD.md, /Users/Jayesh/dib/README.md, /Users/Jayesh/dib/.banned-phrases, /Users/Jayesh/dib/scripts/lint-copy.mjs.
>
> The owner's hard rules — any violation is a finding:
> - No unmeasured accuracy figure ("68% accurate"), no drug-count claim ("20,000 drugs"), no "data from testing agencies", no rat/doctor/clinical-validation claims, no claim that the 3D body or disease layer is finished, no claim it predicts allergies or whether a drug works.
> - Never "safe dose", "recommended dose", "you should take" (or close variants) in UI, docs, comments, README, API prompts.
> - Interaction misses must say "Not in our small verified set", never "no interaction" or "safe".
> - Fixed disclaimer must stay visible: "Educational simulator. Population-average estimate. Not medical or dosing advice."
> - Real drug parameters must not be invented; data/drugs.json must stay null until cited.
>
> Scan every user-visible string and every doc: apps/web/app/**, apps/web/components/**, apps/web/lib/**, packages/**, api/**, data/*.json, docs/**, README.md, supabase/**. Check:
> 1. Banned phrases and paraphrases that imply dosing advice or safety (e.g. "normal dose", "it is safe to", "you can take", "dose range is fine").
> 2. Overclaims vs the honesty rules above.
> 3. Where the disclaimer actually renders: is it on every screen or only inside the simulator report? List each route and whether the disclaimer is visible before/without running a simulation.
> 4. The copy-lint script's real coverage. Verify by reading scripts/lint-copy.mjs which directories it actually scans, and state precisely whether apps/web UI strings are linted. Suggest a concrete test that would prove it (do not implement).
> 5. Placeholder drug fixture copy (apps/web/lib/example-drug.ts, components/simulator/simulator.tsx): does it clearly read as non-real to a first-time user?
> 6. Stale or contradictory copy vs what the app actually does (e.g. "the simulator is the next build step", "no UI", "no accounts").
>
> Return concise markdown: (a) what is solid, (b) findings ranked CRITICAL/HIGH/MEDIUM/LOW with file:line and exact quoted text and a replacement suggestion, (c) a route-by-route disclaimer table, (d) verdict on lint coverage with evidence. Quote exact strings; do not paraphrase.

**What it returned (condensed).** No forbidden overclaims anywhere (`68%`, `20,000 drugs`,
"testing agencies", rat/doctor/clinical claims, allergy claims: all absent). Real-drug data honestly
blank. The fixed disclaimer exists and is unit-tested in `buildReport.ts:22`. Interaction-miss
wording correct in code.

Findings, including a route-by-route disclaimer table:

- **Disclaimer present on 0 of 6 marketing/entry screens.** It renders only inside the simulator
  result card (`simulator.tsx:251`), and only when a valid result exists. `/about`, `/how-it-works`
  and `/signin` each carry a *different paraphrase* that drops either "population-average" or
  "dosing advice".
- **`lint:copy` does not lint the UI.** Confirmed by reading `scripts/lint-copy.mjs:28`: scan roots
  are `packages, api, data, supabase`. `apps/web` is used only for the `service_role` literal check.
  `docs/` and root `*.md` are not scanned at all, despite the file's own comment claiming "the whole
  workspace". Suggested proof test: drop a probe file containing a banned phrase into `apps/web`
  and assert a non-zero exit.
- `/about` and `/how-it-works` claim a live "verified interaction list" and delete-at-any-time
  behaviour that do not exist.
- The placeholder banner says "nothing is invented here" directly above invented numbers.

## C3. Security and RLS reviewer — exact prompt

> READ-ONLY security review. Do not modify files, do not print or copy secret values you encounter (report only key NAMES and whether they look like real keys, never the value). Repo: /Users/Jayesh/dib.
>
> Review:
> - /Users/Jayesh/dib/supabase/migrations/0001_init.sql and /Users/Jayesh/dib/supabase/tests/*
> - /Users/Jayesh/dib/packages/data-client/*.ts
> - /Users/Jayesh/dib/packages/summary/src/index.ts
> - /Users/Jayesh/dib/apps/web/app/api/summary/route.ts, apps/web/app/AuthPanel.tsx, apps/web/app/signin/page.tsx
> - /Users/Jayesh/dib/scripts/check-supabase.ts, scripts/lint-copy.mjs
> - env handling: .gitignore, .env.example, apps/web/.env.local presence (do NOT echo contents), next.config.ts
>
> Check specifically:
> 1. RLS: do the 8 policies actually prevent cross-user reads/writes? Is anon fully revoked? Can an authenticated user forge user_id on insert/update? Any SECURITY DEFINER function with a missing/incorrect search_path? Does the report-cap trigger behave correctly under RLS?
> 2. Client-side secret exposure: is any privileged key ever referenced in packages/ or apps/? Does the anon key get exposed in a way that matters? Is NEXT_PUBLIC_ usage correct?
> 3. Logging: any console.log / error path that would print profile or report contents, request bodies, tokens or emails.
> 4. Summary endpoint: input validation strictness, number-grounding bypasses, prompt-injection surface (untrusted strings like drug name flowing into the prompt), CORS correctness, rate limit effectiveness (per-instance vs per-IP, x-forwarded-for spoofing), missing auth on an endpoint that spends money.
> 5. Git history: search committed history for env files or keys (use `git log --all --stat`, `git grep` over history with patterns like 'eyJ', 'SUPABASE_SERVICE', '.env'). Report file names and commit hashes only, never key values. Check whether `reference/` is ignored.
> 6. Supply chain: anything obvious in package.json (unpinned/unusual deps, postinstall scripts). Read-only, no audit network calls needed.
> 7. Auth flow: sign-in page, OTP flow, Google OAuth redirect target `/auth/callback` — does that route exist in apps/web/app? Check the build output route list in any existing logs if present, otherwise the app directory.
>
> Return concise markdown: (a) 3-5 solid things, (b) findings ranked CRITICAL/HIGH/MEDIUM/LOW with file:line, attack/failure scenario, and fix, (c) explicit "verified clean" list, (d) anything you could not verify and why. Never include secret values.

**What it returned (condensed).**

Verified clean: all 8 RLS policies use `auth.uid()` on **both** `using` and `with check`
(`0001_init.sql:43-75`), so a user cannot read across users, forge `user_id` on insert, or reassign
ownership on update. `revoke all ... from anon` (`:77-78`). `handle_new_user()` is a correct
`SECURITY DEFINER` with `set search_path = ''` and a fully-qualified table name (`:84-95`). No
privileged key in client code (`client.ts:103-106` rejects it; two independent scanners enforce it).
No `console.*` of profile/report/email/token. No secrets in git history. Both live keys confirmed
`role=anon` (length 208). Summary output guards are real: strict zod, numeric grounding, banned-
phrase check, deterministic fallback.

Findings:

- **`/api/summary` is unauthenticated.** CORS only stops a browser reading the reply, not `curl`.
  The 20/min limiter is an in-memory map: per-instance, reset on cold start, and keyed on the
  leftmost `x-forwarded-for` hop, which the caller controls. Rotating that header gives unlimited
  buckets. No UI calls it, so today it is pure cost exposure.
- Google OAuth redirects to `/auth/callback`, which does not exist in the built route list. Today the
  provider is disabled so it fails with a message; the day it is enabled, users return to a 404 with
  a live token in the URL fragment.
- Report-cap trigger has an unpinned `search_path` (Supabase lint) and races at exactly 199 reports.
- `supabase/tests/rls_checks.sql` is entirely commented out; the vitest suite regex-matches its text,
  so nothing actually proves user B cannot read user A's rows.
- `packages/data-client/auth.ts:6-15` `redirectTo` accepts any `http(s)` URL, including plain HTTP.
- No CSP, `X-Frame-Options`/`frame-ancestors`, or HSTS in `next.config.ts`.

Could not verify: live database policy state (the 4/4 check proves connectivity and anon denial,
not that every policy exists as written), Supabase dashboard redirect allow-list, deployment env
scope.

## C4. Frontend reviewer — exact prompt

> READ-ONLY review. Do not modify files. Repo: /Users/Jayesh/dib.
>
> You are the frontend reviewer for the Next.js app at /Users/Jayesh/dib/apps/web. Read:
> - app/layout.tsx, app/page.tsx, app/globals.css, app/signin/page.tsx, app/AuthPanel.tsx, app/how-it-works/page.tsx, app/about/page.tsx, app/simulator/page.tsx, app/demo/page.tsx, app/api/summary/route.ts
> - components/landing/hero.tsx, components/landing/head-viewer.tsx, components/simulator/*.tsx, components/ui/*
> - lib/example-drug.ts, next.config.ts
> - For requirements: /Users/Jayesh/dib/docs/PRD.md (MVP features table, user flow) and /Users/Jayesh/dib/docs/TRD.md (frontend section)
>
> Check:
> 1. Requirements gaps: the PRD lists must-haves (drug picker, live curve with play/pause and time slider, multi-dose scheduling, report, disclaimer on every screen, interaction warnings). State precisely what exists and what does not, with file:line.
> 2. Navigation: can a user reach /simulator from the landing page? From every page? Is there any dead link, unlinked route, or orphan page?
> 3. Accessibility: labels tied to inputs, aria on canvas/svg, keyboard operation of the head viewer (canvas drag has no keyboard equivalent?), focus states, colour-only meaning, heading order.
> 4. Mobile layout: fixed heights (svh), overflow, tap targets, the mobile menu, canvas rendering on small screens.
> 5. Runtime robustness: what happens with Supabase env missing, slow network, a failed save, an invalid number typed into inputs (NaN via Number("")), hydration issues with the canvas/useEffect, memory/CPU on the head viewer (it sorts ~4000 points every frame at 60fps).
> 6. Code quality: duplicated constants, unused imports/props, dead code, stale copy, `any` usage, inconsistent light/dark classes (the site was just converted to a light-only theme).
> 7. Anything that implies medical advice or hides the educational disclaimer.
>
> You may run read-only commands (grep, ls, reading built route list) but not builds or edits.
>
> Return concise markdown: (a) solid things, (b) findings ranked CRITICAL/HIGH/MEDIUM/LOW with file:line, user-visible symptom, and fix, (c) a precise PRD must-have checklist (present / partial / missing), (d) accessibility list. Do not speculate; cite lines.

**What it returned (condensed).** Solid: missing Supabase config degrades without crashing
(`AuthPanel.tsx:25-32`, `simulator.tsx:45-48`); the head viewer handles lifecycle correctly
(deterministic PRNG, DPR capped at 2, `ResizeObserver` + rAF cleanup, `prefers-reduced-motion`
stops rotation, canvas labelled, arrow-button fallback).

Findings:

- **No path from the landing page to `/simulator`.** `hero.tsx:8-12` nav is Home / How does this
  work / About us; the hero has no CTA; the account icon goes to `/signin`. The product is two
  clicks from the only marketing page.
- Mobile dose row overflows at 375 px: a non-wrapping row with a 64 px label, two 96 px inputs,
  "mg at", "h" and "remove", inside `px-6` page padding plus `p-6` card — roughly 400 px needed.
  Symptom: horizontal scroll, clipped remove button.
- Head viewer sorts ~4,000 points every frame, allocates an object per point, keeps drawing when
  scrolled off-screen, redraws at 60 fps even under reduced motion, and multiplies point size by
  `dpr` while the context is already scaled by `dpr` (dots too large on retina).
- `Number("")` is `0`, so a cleared dose silently becomes a valid 0 mg dose. The error text says
  "Fix the highlighted inputs" but nothing is highlighted and nothing has `aria-invalid` or
  `role="alert"`.
- PRD must-have checklist: drug picker missing; live curve with play/pause/slider missing (chart is a
  static SVG from props); body view missing; interaction warnings missing; export missing; footer
  with sources and DDInter attribution missing; disclaimer on every screen failing.
- `globals.css:9-12` has `--font-sans: var(--font-sans)` — a self-reference; 22 `dark:` utilities
  and a `.dark` palette remain after the light-theme conversion.

## C5. Repo researcher — what was done instead of a subagent

The 23 repos in context §6 were cloned with `git clone --depth 1` into `reference/` (parallel, 4 at
a time; two clones completed but the first batch was lost to an `xargs` argument-length error and
re-run), `reference/` was added to `.gitignore`, and `reference/NOTES.md` was written from the local
clone metadata plus each repo's licence file.

Notes on method, stated plainly because it limits the conclusions:

- "Last commit" is from the shallow clone, i.e. the tip of the default branch at clone time.
- **GitHub's API was unreachable from this machine**, so `archived` status was *not* checked. The
  notes say so rather than guessing. Staleness is inferred from commit date alone.
- Licences were read from each repo's `LICENSE`/`COPYING`/`DESCRIPTION`, not from a database.
- One clone (Augmented-Nature/OpenFDA-MCP-Server) contains a hardcoded third-party key in its source.
  It is treated as local-only and must never be committed. `reference/` is ignored, so it is not.

Licence summary: GPLv2 (PK-Sim, Suite), GPL-2/3 (pmxTools, linpk), BSD-3 (chi), MIT (pkdb, pkpdsim,
Rxcheck, TDC, PK-Visualization, both body highlighters, claude-scientific-skills), Apache-2.0
(biomni, fhir-mcp-suite), CC BY 4.0 (SciAgent-Skills), CC BY-NC-SA 4.0 (MedFlow, DDInter *data*),
custom "view/use only, no redistribution" (both Augmented-Nature servers), and **no licence file at
all** (Erythromycin-Alfentanil-DDI, DDInter plugin code, anthropics/life-sciences,
anthropics/skills). Full table in `reference/NOTES.md`.

## C6. Roles deliberately NOT run

- **Parameter sourcer** (context §7.6): not run. It needs a human to approve candidate values before
  anything enters `data/drugs.json`, and the owner has not yet chosen which two extra drugs join
  caffeine/paracetamol/ibuprofen. Running it early risks producing plausible-looking numbers nobody
  asked to review.
- **Interaction verifier** (context §7.7): not run. `data/interactions.json` is empty and no
  candidate pairs were proposed. Verifying pairs that are not going to be used would be wasted
  effort, and the DDInter data is non-commercial, which affects whether it can be used at all.

---

# Part D — Ranked findings

Full text with evidence and fixes is in `REVIEW.md` §3. This is the index.

## Critical

| # | Finding | Where |
| --- | --- | --- |
| C1 | The mandatory disclaimer is missing from almost every screen; only renders inside a successful simulator result | `layout.tsx:30-38`, `simulator.tsx:251` |
| C2 | Copy lint does not scan the UI, so a dosing-advice line in the app would ship green | `scripts/lint-copy.mjs:28` |
| C3 | Saving a report writes fabricated "minor" self-interactions and collapses the dose schedule to one time | `simulator.tsx:111-125` |
| C4 | No route from the landing page to `/simulator` | `hero.tsx:8-12` |

## High

| # | Finding |
| --- | --- |
| H1 | A dose scheduled past `tEndH` throws a raw "internal error" string onto the screen |
| H2 | `Infinity`/`NaN` pass validation (`Number.isNaN` only) |
| H3 | Bioavailability `F` silently defaults to 1.0 |
| H4 | Google sign-in would land on a 404 (`/auth/callback` does not exist) |
| H5 | `/api/summary` is unauthenticated, unrate-limited in practice, and unused |
| H6 | Privacy copy contradicts itself across PRD, TRD, `/about`, `/how-it-works`, `/signin` |
| H7 | Two pages claim a verified interaction list that is empty |
| H8 | Placeholder banner says "nothing is invented here" above invented numbers |
| H9 | Mobile simulator dose row overflows |
| H10 | Landing bust sorts 4,000 points per frame, runs off-screen, over-sizes dots on retina |
| H11 | Weight scaling applied to both V and CL while the TRD documents only V, so peak level silently ∝ 1/weight |

## Medium (full list — the first version of this packet hid these)

| # | Where | Problem |
| --- | --- | --- |
| M1 | `buildReport.ts:17` | Caller warnings **replace** engine warnings instead of merging; a passed note hides the label-range warning. |
| M2 | `simulate.ts:32,137-152` | No RK4 stability guard. Measured: `ka=60, dt=0.05` → `2.4e68` in the gut; `ka=100` → `NaN`. |
| M3 | `simulate.ts:159-177` | Cmax/Tmax/timeToClear are whole-window and grid-sampled; on repeated dosing the report can say "Tmax 50.25 h" or report a clear time with a dose still scheduled. |
| M4 | `closedFormSingleDose.ts:47-49` | Analytic reference truncates its grid while `simulate` clamps; at `tEnd=1, dt=0.3` its Cmax is ~5% low. |
| M5 | `simulate.ts` | `route: 'iv'` is simulated as oral (measured: fake peak at 2.3 h). |
| M6 | `simulator.tsx:121-127` | Saved report never records the "placeholder parameters" caveat; it reads as sourced pharmacology. |
| M7 | `apps/web/package.json` | `@dib/engine` imported but not declared as a dependency; resolves only via workspace hoisting. |
| M8 | `lint-copy.mjs` + `.banned-phrases` | Only 3 phrases; "normal dose", "it is safe to", "no interaction" pass. Summary prompt builds the banned phrases by concatenation to dodge the lint. |
| M9 | `packages/summary/src/index.ts:22-27,82` | `drugs`/`warnings` arrays uncapped; whole body stringified into the prompt; `times: []` prints "starting at Infinity h". |
| M10 | `packages/summary/src/index.ts:18,126` | Free-text `name`/`pair`/`note` (newlines allowed) enter the prompt; numeric grounding does not stop non-numeric medical assertions. |
| M11 | `curve-chart.tsx:62-65` | "Time to clear" marker is an unlabelled amber line — meaning rests on colour alone; axis text ~5 px wide on a phone. |
| M12 | `AuthPanel.tsx:20-50,96-99` | `mounted.current` guard breaks under StrictMode's second mount; signed-in copy still says "The simulator itself is the next build step". |
| M13 | `simulator.tsx:162-211` | `Number("")` is `0`, so a cleared dose becomes a valid 0 mg dose; errors say "Fix the highlighted inputs" but nothing is highlighted and nothing has `aria-invalid`/`role="alert"`. |
| M14 | `globals.css:9-12,131-133` | `--font-sans: var(--font-sans)` self-reference; 22 `dark:` utilities and a `.dark` palette remain after the light-theme conversion. |
| M15 | `0001_init.sql:105-118` | Report-cap trigger: unpinned `search_path`; two concurrent inserts at 199 both pass. |
| M16 | `supabase/tests/rls_checks.sql` | **The whole file is commented out; the vitest suite only regex-matches its text. Nothing actually proves user B cannot read user A's rows.** |
| M17 | `packages/data-client/auth.ts:6-15` | `redirectTo` accepts any `http(s)` URL, including plain HTTP. |
| M18 | `next.config.ts` | No CSP, `X-Frame-Options`/`frame-ancestors`, or HSTS; the sign-in panel is frameable. |

Low: 13 grouped items in `REVIEW.md` §3, none needed for the next milestone.

## Which findings are measurements vs judgements

This distinction matters if you are auditing the audit.

**Measured** (the agent ran the real code and reported numbers): H2 (`tEndH: Infinity` never
returned; `dtH: NaN` → `[0, NaN]`), M2 (`ka=60, dt=0.05` → `2.4e68`), M4 (`tEnd=1, dt=0.3` → 0.9 h,
Cmax 5% low), M5 (IV route shows a peak at 2.3 h), H1 (read from source and reproduced through the
UI path, not timed), C1/C2/C4/H7/H8 (read directly from source and route list).

**Judgement calls** (could reasonably be argued the other way): H10's performance severity (no
profiling was done; the per-frame sort is read from source), M3's Cmax/Tmax definition (what the
*right* answer is depends on product intent, not maths), H6 (whether the docs or the code should
change is a product decision), and every severity ranking itself.

**Not verified at all:** the live database policy state, the Supabase dashboard redirect list,
deployment env scope, GitHub `archived` flags for the reference repos, and any behaviour under real
network latency.

---

# Part E — What was added to the repo for this review

```
M  .gitignore            + reference/ (keeps 1.2 GB of third-party clones out of git)
?? REVIEW.md             the deliverable: findings, gaps, work order, decisions
   reference/NOTES.md    licence + staleness table for the 23 clones (inside the ignored folder,
                         so it is local-only and will not be committed unless force-added)
   docs/REVIEW-PACKET.md this file
```

No product code was touched. Last commit remains `a286dc1`.

---

# Part F — Decisions still open

From `REVIEW.md` §9. Nothing proceeds until these are answered.

1. Demo drugs named "Demo drug A/B/C", or one "Example PK drug"?
2. Rewrite PRD/TRD to match the accounts that exist, or remove accounts from the app?
3. Build report list + delete UI, or delete the "can be deleted" claims?
4. Remove the Google button until `/auth/callback` exists, or build the callback now?
5. Add a "Simulator" nav item and a hero button?
6. Delete the orphan `/demo` route and its 459-line wordmark, or keep it?
7. Keep the AI summary route (with auth/quota work) or leave it unused?
8. Which two drugs join caffeine, paracetamol and ibuprofen — and should cited parameter
   *candidates* be gathered for approval next?

---

# Part G — How to review this packet

If you are the reviewing Claude, these are the useful things to check, in order:

1. **Do the critical findings survive contact with the source?** Read `scripts/lint-copy.mjs:28`,
   `apps/web/app/layout.tsx:30-38`, and `apps/web/components/simulator/simulator.tsx:111-125`
   yourself. If any of C1–C4 does not hold, say so loudly — the whole work order rests on them.
2. **Is the safety story coherent?** Part A §2 and §5 are the rules. Part D is what was found
   against them. Check that nothing in `REVIEW.md` itself repeats a retracted claim from Part A §2.
3. **Is the proposed order of work right?** `REVIEW.md` §8 puts a safety/correctness gate before any
   feature work. Argue against it if you think that delays the thing that matters.
4. **Are the open decisions actually decisions, or are some of them already answered by Part A?**
   For example, Part A §8 says "MVP has accounts and saved reports", which arguably settles decision 2
   in favour of rewriting the docs rather than removing accounts.
5. **What did the reviewers not look at?** The gap list is in Part D ("Not verified at all") and
   Part C6. Anything outside it that you consider material is a genuine addition.

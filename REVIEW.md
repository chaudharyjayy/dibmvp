# REVIEW.md — dib, review only

Date: 2026-11-10 · Branch `main` at `a286dc1` · No product code changed.

Read in this order: this file, then `reference/NOTES.md`.
Nothing here has been fixed yet. Section 8 is the proposed order of work; section 9 lists the
decisions I need from you before starting.

**Plain-language terms used below**

- **PK** — pharmacokinetics: what the body does to a drug over time.
- **Cmax / Tmax** — the highest concentration reached, and when it happens.
- **t½ (half-life)** — time for the concentration to halve.
- **RLS (Row Level Security)** — database rules that decide which rows each signed-in user may read or write.
- **Lint** — an automatic check that fails the build when forbidden text is found.
- **Fixture** — fake test data used to exercise code, not real pharmacology.
- **Guardrail** — an automatic check that blocks unsafe output.

---

## 1. Verification — what I ran

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 5 files, **77/77 tests**, 194 ms |
| `npm run lint:copy` | **Pass** — "OK — no banned phrases found" (but see C2: it does not scan the UI) |
| `npm run typecheck` | **Pass** — exit 0, no output |
| `npm run check:supabase` | **Pass** — `ALL CHECKS PASS` (4/4): connects, anon reads 0 rows, anon insert rejected, tables exist |
| `npm run build:web` | **Pass** — 8 routes: `/`, `/about`, `/api/summary`, `/demo`, `/how-it-works`, `/signin`, `/simulator`, `/_not-found` |

All commands were run from `/Users/Jayesh/dib` on the production build path. The dev/production
server on port 3000 was already running; the build does not disturb it.

**Interpretation:** the mechanical health is good — the engine's unit tests, type checking and the
database checks all pass. The problems below are mostly about *what the app claims* and *what the
UI does not yet do*, not about broken compilation.

---

## 2. What is solid

1. **The engine's core maths is right.** One-compartment oral model, correct analytic solution,
   correct handling of the `ka ≈ ke` edge case, consistent units (mg, L, h, mg/L), RK4 with proper
   end-of-window clamping, and exact accumulation when a second dose lands on a later step.
   `packages/engine/simulate.ts:26-156`, `packages/engine/closedFormSingleDose.ts:35-69`.
2. **The tests check physics, not just "it runs".** Mass balance, superposition, an independent
   closed-form oracle, Cmax/Tmax against the textbook formula, and a negative-value invariant
   (`packages/engine/tests/engine.test.ts:27-108`). This is better than most MVPs at this stage.
3. **Honest data files.** `data/drugs.json` has `null` for every parameter; `data/interactions.json`
   is empty. No invented real-drug numbers anywhere. (`data/drugs.json:7-11`)
4. **Interaction-miss wording is correct in code** — "Not in our small verified set", never "safe",
   with a test asserting the exact string (`packages/engine/lookupInteraction.ts:21-24`,
   `tests/engine.test.ts:174-178`).
5. **The AI summary has real guardrails.** Strict zod schemas, every reply number must appear in the
   input, banned-phrase check, and a deterministic template fallback on any failure
   (`packages/summary/src/index.ts:20-75,145-159`).
6. **Security basics are genuinely good.** All 8 RLS policies use `auth.uid()` on both `using` and
   `with check`; `anon` is revoked; the signup trigger is a correctly pinned `SECURITY DEFINER`;
   no privileged key exists in client code; git history contains no secrets; nothing logs profile or
   report contents. (Detail in §6.)
7. **Auth is optional and the simulator works signed out** (`simulator.tsx:45-64,253-261`).
8. **The landing page is now fully code-generated** — no video, no images, and it respects
   `prefers-reduced-motion` (`components/landing/head-viewer.tsx`).

---

## 3. Bugs and risks, ranked

### CRITICAL

**C1. The mandatory disclaimer is missing from almost every screen.**
`docs/PRD.md:103` says it must be visible on every screen; `docs/TRD.md:166` says a fixed component
renders everywhere. In reality `apps/web/app/layout.tsx:30-38` renders only `{children}`. The exact
string appears in exactly one place — inside the simulator's result card
(`components/simulator/simulator.tsx:251`) — and only while a valid result exists. The landing page,
`/demo`, and the top of `/simulator` have none; `/about`, `/how-it-works`, `/signin` have three
different paraphrases, each dropping "population-average" or "dosing advice".

*Why it matters:* this is the one safety control the owner named as non-negotiable, and the first
screen a reviewer sees has no disclaimer at all. *Fix:* one `Disclaimer` component in the root
layout, fixed string, always visible, in addition to the report note.

**C2. The copy lint does not scan the UI — the control the docs rely on is not wired.**
`scripts/lint-copy.mjs:28` scans `packages`, `api`, `data`, `supabase` only. `apps/web` is used only
for a `service_role` key check (`:34,56`), never for banned phrases. `docs/`, `README.md` and
`scripts/` are not scanned either, despite the file's comment claiming "the whole workspace".
`docs/TRD.md:162` claims "Copy lint … No banned phrases in the UI or summary" — that is false today.
A line like "Recommended dose: 200 mg" in `simulator.tsx` would ship green.

*Fix:* add `apps`, `docs` and root `.md` files to `scanRoots`, and add one test that inserts a
probe file into `apps/web` and asserts a non-zero exit. Without that test the gap can silently return.

**C3. Saving a report writes fabricated interaction warnings and loses the dose schedule.**
`simulator.tsx:121-125` creates one warning per dose row with `severity: "minor"`, `pair:` the drug's
own id, and an empty note — even when the engine found no interaction (and it cannot, with one drug).
Every saved report therefore contains a made-up "minor interaction" with itself. Separately,
`:111-115` groups doses by `(timeH, doseMg)` and then keeps only the first entry per drug, so a
0 h + 6 h schedule is saved as a single time.

*Why it matters:* this is exactly the "never invent interaction pairs" rule, violated in stored data,
and the saved report no longer represents what the user simulated. *Fix:* send `warnings: []` until
real pairs exist, and save one drug entry containing all dose times.

**C4. There is no way to reach `/simulator` from the landing page.**
`hero.tsx:8-12` nav is Home / How does this work / About us; the hero has no call to action; the
account icon goes to `/signin`. `/simulator` is reachable only from a secondary link at the bottom of
`/how-it-works` and `/about`. The core product is two clicks from the only marketing page.

*Fix:* one primary button in the hero that goes to `/simulator`. **Not** a fourth nav item — your
requirement fixes the nav at exactly Home / How does this work / About us.

### HIGH

**H1. An ordinary input combination throws a raw "internal error".**
`tEndH` can be 12 h (`simulator.tsx:222-232`) while "Add dose" happily creates a dose at +6 h steps up
to 96 h (`:191-196`, inputs allow `timeH ≤ 96` at `:209`). The engine then throws
`simulate: internal error — a dose event was never applied` (`simulate.ts:154-156`), and the UI shows
that text verbatim (`:93-95,241`). *Fix:* validate `timeH <= tEndH` in the form and re-clamp when the
window shrinks; make the engine clip with a warning instead of throwing.

**H2. `Infinity` / `NaN` pass input validation.**
`simulate.ts:34,44,47,51,54` use `Number.isNaN`, which is false for `Infinity` (`NaN <= 0` is also
false). `tEndH: Infinity` loops forever (`:137`), `dtH: NaN` returns a one-point NaN series, and
`weightKg: Infinity` yields an all-NaN curve reported as `cmax 0`. The UI's `<input type=number>` can
produce `NaN` for some inputs. *Fix:* `Number.isFinite` on every numeric field, plus a hard cap on
the number of steps.

**H3. `F` (bioavailability) silently defaults to 1.0.**
`simulate.ts:4` (`drug.F ?? 1`) and `:82`. `ka`, `V` and `CL` throw when null; `F` does not. A drug
with `F: null` and the other three filled will silently produce a Cmax 2–5× too high for a low-F
drug. `data/drugs.json:8` currently has `"F": null`, so this is one data-entry step away from being
live. *Fix:* require `F`, or fall back with a visible warning ("F assumed 1.0 — not sourced").

**H4. Google sign-in lands on a 404.**
`AuthPanel.tsx:72-74` redirects to `${origin}/auth/callback`; no such route exists in the build.
The provider is currently disabled, so the button fails with a message first — but the moment it is
enabled, users return to a 404 with a live access token in the URL fragment. *Fix:* add the callback
route with code exchange, or remove the Google button until then.

**H5. `/api/summary` is unauthenticated and nothing calls it.**
`apps/web/app/api/summary/route.ts:53` + `packages/summary/src/index.ts:182-220`: no auth, no origin
enforcement (CORS only stops browsers reading the reply, not `curl`), and the 20/min limit is an
in-memory map that is per-instance and resets on every cold start. The limiter key comes from the
leftmost `x-forwarded-for` hop (`route.ts:35-44`), which a caller controls — rotating it gives
unlimited buckets. No UI code calls the route (`grep` finds no `fetch("/api/summary")`), so today it
is pure cost exposure. *Fix:* require a Supabase JWT and quota by user in a shared store, or remove
the route until the UI needs it.

**H6. Privacy copy contradicts itself across pages.**
`docs/PRD.md:106` says "No personal data is stored; the body profile stays in the browser";
`docs/TRD.md:7` says "no accounts, no stored person". Reality: profiles and reports are uploaded
(`simulator.tsx:67-77,134-139`, `packages/data-client/profile.ts`, `supabase/migrations/0001_init.sql:10-30`).
`/about` says the numbers are stored (`about/page.tsx:69-74`); `/how-it-works` says "nothing else
stored" (`:16`); `/signin` says "three numbers the model uses" while the simulator says age and sex
are unused (`simulator.tsx:155-158`). *Fix:* make the PRD/TRD describe the real model (optional
accounts, user-owned rows) and align the three pages to one statement.

**H7. `/about` and `/how-it-works` claim a verified interaction list that does not exist.**
`about/page.tsx:55-56` ("a short verified interaction list"), `how-it-works/page.tsx:41-49`
("Interactions, only from a verified list" … "can be deleted … with a single call").
`data/interactions.json` is `[]`, `lookupInteraction` is never called by the UI, and there is no list
or delete screen. *Fix:* present tense is wrong twice — rewrite to "planned, not yet populated" and
"the data layer supports delete; a delete screen is not built".

**H8. The placeholder banner says "nothing is invented here" while showing invented numbers.**
`apps/web/lib/example-drug.ts:23-25`. The values on screen (`ka 1.0`, `F 1.0`, `V 5 L/kg`,
`CL 0.7 L/h/kg`) are synthetic and were invented as a test fixture. A first-time reader can take the
sentence as a provenance claim about the displayed curve. *Fix:* "These are synthetic test values for
a fake 'Example PK drug' — not real pharmacology."

**H9. The mobile simulator dose row overflows.**
`simulator.tsx:199-218`: a non-wrapping row with a 64 px label, two 96 px inputs, "mg at", "h" and
"remove" inside `px-6` page padding + `p-6` card. At 375 px it needs roughly 400 px. *Symptom:*
horizontal scroll and a clipped remove button. *Fix:* wrap or switch to a 2-line grid per dose on
small screens.

**H10. The landing bust sorts ~4,000 points every frame and never pauses off-screen.**
`head-viewer.tsx:169-192` allocates an object per point and sorts them all each frame; the rAF loop
(`:225-239`) keeps drawing when the hero is scrolled away, and under reduced motion it still redraws
at 60 fps. Point size also multiplies by `dpr` (`:187`) while the canvas context is already scaled by
`dpr` (`:221`), so dots are too large on retina screens. *Fix:* the four alpha buckets already order
the paint — bucket into arrays without sorting, reuse point objects, drop the extra `dpr` factor, and
skip drawing when `document.hidden` or the canvas is out of view.

**H11. Weight scaling is applied to both V and CL, but the TRD documents only V.**
`simulate.ts:96-99` multiplies both `V` and `CL` by `weightKg`, so `ke = CL/V` is weight-invariant
and Cmax scales as 1/weight. `docs/TRD.md:44` says only "V scales with body weight". Consequence: a
100 kg user sees a peak about 30% lower than a 70 kg user for the same dose, with the same half-life,
and nothing on screen says this is a deliberate per-kg model assumption rather than physiology.
It is not necessarily wrong — but it has to be chosen and written down before the 20% validation,
or the error numbers are measured against an unstated model. *Fix:* state the rule in the TRD (V and
CL both scale per kg, so `ke` is constant), surface it on the simulator screen, and make the
cross-check against `chi` or PK-Sim use the same assumption.

### MEDIUM

| # | Where | Problem |
| --- | --- | --- |
| M1 | `buildReport.ts:17` | `warnings.length ? warnings : result.warnings` **replaces** engine warnings instead of merging them; a caller-passed note silently hides the label-range warning. |
| M2 | `simulate.ts:32,137-152` | No RK4 stability guard. Measured: `ka=60, dt=0.05` → `2.4e68` in the gut; `ka=100` → `NaN`. Any `ka ≥ 5.6 h⁻¹` with `dt=0.5` breaks. Subdivide until `max(ka,ke)·dt ≤ ~0.5`, or throw. |
| M3 | `simulate.ts:159-177` | Cmax/Tmax/timeToClear are whole-window and grid-sampled. With 100 mg q24h ×3 the report says "Tmax 50.25 h"; on a repeated-dose curve "time to clear 36.4 h" can be reported while another dose is still scheduled. Decide and label: last-interval vs whole-window. |
| M4 | `closedFormSingleDose.ts:47-49` | The analytic reference truncates its grid (`round(tEnd/dt)`) while `simulate` clamps to `tEnd`; with `tEnd=1, dt=0.3` the reference ends at 0.9 h and its Cmax is ~5% low. Current tests use windows that divide evenly, hiding it. |
| M5 | `simulate.ts` (never reads `route`) | `route: 'iv'` is simulated as oral; an IV drug would show a fake absorption peak (measured: Tmax 2.3 h). Reject non-oral routes until implemented. |
| M6 | `simulator.tsx:121-125` + `:127` | Saved reports record `summarySource: "template"` and a summary built from bullets, but never the "placeholder parameters" caveat; a saved report reads as sourced pharmacology. |
| M7 | `apps/web/package.json` | `@dib/engine` is imported (`simulator.tsx:4`) but not declared as a dependency; it only resolves through workspace hoisting. Installing `apps/web` alone fails. |
| M8 | `scripts/lint-copy.mjs` + `.banned-phrases` | The phrase list is only 3 entries; "normal dose", "it is safe to", "no interaction" pass. Also, the summary prompt contains the literal banned phrases, constructed with string concatenation (`packages/summary/src/index.ts:55,100`) specifically to avoid the lint. |
| M9 | `packages/summary/src/index.ts:22-27,82` | `drugs` and `warnings` arrays are uncapped, and the whole body is stringified into the Claude prompt. `times: []` is allowed, so the template prints "starting at Infinity h". |
| M10 | `packages/summary/src/index.ts:18,126` | Free-text `name`/`pair`/`note` (up to 100 chars, newlines allowed) go into the prompt; numeric grounding does not stop non-numeric medical assertions. Sanitise and keep names out of the instruction channel. |
| M11 | `curve-chart.tsx:62-65` | The "time to clear" marker is an unlabelled amber line — meaning rests on colour alone, contrary to TRD §Frontend. Axis text renders ~5 px wide on a 360 px phone. |
| M12 | `AuthPanel.tsx:20-50,96-99` | `mounted.current` guard breaks the effect on React StrictMode's second mount in dev; signed-in copy still says "The simulator itself is the next build step" with no link. |
| M13 | `simulator.tsx:162-211` | `Number("")` is `0`, so a cleared dose silently becomes a valid 0 mg dose; errors say "Fix the highlighted inputs" while nothing is highlighted and nothing has `aria-invalid`/`role="alert"`. |
| M14 | `globals.css:9-12,131-133` | `--font-sans: var(--font-sans)` is a self-reference; `@apply font-sans` computes to nothing (body font only works via the explicit override at `:51`). 22 `dark:` utilities and the `.dark` palette remain in shipped markup after the light-theme conversion. |
| M15 | `0001_init.sql:105-118` | Report-cap trigger: `search_path` unpinned (Supabase lint), and two concurrent inserts at 199 both pass. Low data risk. |
| M16 | `supabase/tests/rls_checks.sql` | The whole file is commented out; the vitest suite only regex-matches its text. No test actually proves user B cannot see user A's rows. |
| M17 | `packages/data-client/auth.ts:6-15` | `redirectTo` accepts any `http(s)` URL, including plain HTTP; safety depends entirely on the dashboard allow-list. |
| M18 | `next.config.ts` | No CSP, `X-Frame-Options`/`frame-ancestors`, or HSTS; the sign-in panel is frameable. |

### LOW (grouped, no action required for the next milestone)

- `buildReport.ts:10` — both branches of the headline ternary are the same string; the test only checks it is non-empty.
- `simulate.ts:127-128` — zero doses produce `cmax 0, tmax 0`, and the report says "Time of peak: 0.00 h" with no explanation.
- `simulate.ts:43-50` — `dose.drugId` is never compared to `drug.id`; another drug's dose is applied silently.
- `simulate.ts:92` — `CL = 0` is accepted (flat curve, no clearing) with no warning.
- `lookupInteraction.ts:19-21` — exact, case-sensitive matching; normalise before comparing.
- `closedFormSingleDose.ts:104-137` — `closedFormDoses` is exported but never called.
- `apps/web/app/demo/page.tsx` — orphan route, no inbound link, unrelated wordmark; `components/ui/murmuration-wordmark.tsx` (459 lines) and `@base-ui/react`/`cva` exist only for it.
- `components/ui/button.tsx`, `lib/utils.ts`, `public/*.svg` — unused defaults.
- `simulator.tsx:259` — `<a href="/signin">` forces a full page reload instead of `next/link`.
- `hero.tsx:16-22,53` — logo SVG has `aria-label` without `role="img"`; the "active" nav item is a hardcoded index, not the current path.
- `curve-chart.tsx:57` vs `buildReport.ts:13` — 2 vs 3 decimal places for the same number.
- `layout.tsx:18` — title says "Vibrant Wellness — Drug-in-Body Simulator" while every page and the logo say "Drug-in-Body".
- `packages/engine/README.md:12` — documents `volume_per_kg_l` / `clearance_per_kg_l_per_h`, fields that do not exist; the real names are `V_L_per_kg` / `CL_L_per_h_per_kg`.

---

## 4. Where the code/copy conflicts with `OPENCODE_CONTEXT.md`

| Context says | Reality |
| --- | --- |
| §4: routes are `/` (landing) and `/demo`; "the `/simulator` route is the next build" | Six routes ship: `/`, `/about`, `/how-it-works`, `/signin`, `/simulator`, `/demo`, plus `/api/summary`. The context's repo map is months out of date. |
| §5: the fixed disclaimer "must stay visible" | It is visible only inside a successful simulator result (C1). |
| §2/§5: never invent interaction pairs | `saveReport` writes fabricated `minor` warnings to the database (C3). |
| §2: no unmeasured claims | `/about` and `/how-it-works` claim a "verified interaction list" and runtime report checking that do not exist (H7, M11). |
| §8: accounts and saved reports are MVP | `docs/PRD.md:27,60,106` still say accounts are out of scope and nothing is stored (H6). The docs are the thing that is wrong, not the code. |
| §8: "Do not redesign the landing page until told" | You told me; the redesign is done (`a286dc1`). Update the context so a future session does not revert it. |
| §4: `data/interactions.json` is "a small verified set" | It is empty (`[]`). The docs describe the intended state, not the current one. |
| §7: use subagents | Four read-only reviewers ran for this review (§6). |
| §6: clone reference repos and write `reference/NOTES.md` | Done — 22 repos after the OpenFDA clone was deleted, ~1.2 GB, `reference/` added to `.gitignore`. See `reference/NOTES.md`. |

One more contradiction worth fixing before any demo: `docs/TRD.md:7` is corrupted mid-sentence
("serverless functi- and two-compartment models…"), and `TRD.md:23` still lists Vite while the app
is Next.js 16.

---

## 5. Gaps against the PRD and TRD

### PRD must-haves

| PRD item | Status | Evidence |
| --- | --- | --- |
| Body profile (age, weight, sex) that scales the model | **Partial** — weight scales V and CL; age and sex are collected, stored, unused (and the UI says so) | `simulate.ts:96-98`, `simulator.tsx:155-158` |
| Drug and dose picker (3–5 drugs) | **Missing** — one hardcoded fixture | `example-drug.ts:9-21` |
| One/two-compartment engine in the browser | **Present, one-compartment only** (two-compartment throws by design) | `simulate.ts:71-76` |
| Live curve with play, pause, time slider | **Missing** — static SVG from props, no time state | `curve-chart.tsx:9-16` |
| Multi-dose scheduling | **Present but fragile** — works on screen, saves wrong, throws past the window | `simulator.tsx:191-220`, H1, C3 |
| Report: peak, time to peak, time to clear | **Present** | `simulator.tsx:242-252` |
| Animated body view with organs | **Missing** — the landing bust is decorative, not linked to the simulation | — |
| Interaction warnings for verified pairs | **Missing** — lookup exists, never called, data empty; save fabricates warnings | C3 |
| AI plain-language summary | **Route exists, unused**; save hardcodes the template | `summarySource: "template"` |
| Export as image/PDF | **Missing** | — |
| Disclaimer on every screen | **Failing** | C1 |
| Footer with sources + DDInter attribution | **Missing** — no footer anywhere | `TRD.md:171` |
| No personal data stored / profile stays in the browser | **Contradicted by the implementation** | H6 |

### TRD specifics not met

- Time slider driving chart + body + report from one value (`TRD.md:109-113`) — not built.
- Body view mapping gut/blood/liver/kidney (`TRD.md:112`) — not built.
- Validation against published curves within ~20% (`TRD.md:158`) — not started; no digitised points exist.
- Cross-solver check against PK-Sim or Chi (`TRD.md:159`) — not started.
- Demo path passed 3 runs in a row (`TRD.md:160`) — not recorded.
- Footer with sources and DDInter notice (`TRD.md:171`) — missing.
- Copy lint covering the UI (`TRD.md:162`) — not wired (C2).
- Stack table says React/Vite/static host (`TRD.md:23,176`) — actual stack is Next.js 16 on one server; deployment is unchanged from the PRD's assumption.

---

## 6. Reference repos (section 6 of the context)

Cloned read-only into `reference/` (now 22 repos, ~1.2 GB, ignored by git). Full table in
`reference/NOTES.md`. The `Augmented-Nature/OpenFDA-MCP-Server` clone was deleted on 2026-11-10
because one source file contained a hardcoded third-party key. Short version:

- **Worth real time:** `pmxTools` (closed forms for extra engine tests) and `chi` (independent
  numerical solver) — both are directly useful for the 20%-against-published-curves milestone.
- **Worth reading for design:** `umraa`/MedFlow and `Rxcheck` (cited, verifier-gated interaction
  flow).
- **Data:** `pkdb` is the only current, plausibly usable parameter source; its *data* terms are
  separate from its MIT code licence.
- **Flags:** four repos have no licence file at all (Erythromycin-Alfentanil-DDI, DDInter plugin,
  `anthropics/life-sciences`, `anthropics/skills`); DDInter data, MedFlow and both Augmented-Nature
  MCP servers are non-commercial / no-redistribution; four are stale (2021–2024). One third-party
  clone (`Augmented-Nature/OpenFDA-MCP-Server`) contained a hardcoded third-party key; it was
  deleted from disk on 2026-11-10. Treat `reference/` as local-only and never commit it.
- **Do not** copy PK-Sim/Suite code (GPLv2) into this repo.

---

## 7. Security summary (detail)

**Verified clean:** 8/8 RLS policies correct; `anon` revoked; correctly pinned `SECURITY DEFINER`
signup trigger; no privileged key in client code or bundle; no `console.*` logging of profiles,
reports, emails or tokens; no secrets in git history; `.env`/`.env.local` untracked; strict zod on
every data-client payload and summary request; no `dangerouslySetInnerHTML`/`eval`; no SQL injection
surface in the migration.

**Not verified:** live database state (the 4/4 check proves connectivity and anon denial, not that
every policy exists as written), Supabase dashboard redirect allow-list, and the presence/scope of
`CLAUDE_API_KEY` in deployment.

**Main security exposure:** the unauthenticated summary endpoint (H5). It costs money and has no
user-level brake. Nothing in the UI calls it, so the safest next step is to leave it off until the
auth/quota work is done.

---

## 8. Proposed order of work — next milestone: `/simulator` v1

Scope for this milestone: **one screen, a clearly labelled demo drug, a time dial, multiple doses, a
report, and no real drug parameters.** Real parameters stay `null` in `data/drugs.json`.

### Step 0 — Safety and correctness gate (do first, ~half a day)

Nothing user-facing ships before this, because every later step makes the exposure bigger.

1. Add one `Disclaimer` component to `layout.tsx` with the exact fixed string; visible on every route.
2. Fix lint-copy to scan `apps`, `docs` and root `*.md`; add the probe-file test; widen
   `.banned-phrases` ("normal dose", "it is safe to", "no interaction", …) and remove the
   concatenation trick in the summary prompt.
3. Stop writing fabricated warnings; correct the saved dose schedule (one drug entry, all times) or
   disable "Save report" until step 3.
4. Engine guards: `Number.isFinite` everywhere; require `F`; reject `route !== 'oral'`; validate
   `timeH <= tEndH`; subdivide steps for stability; merge engine + caller warnings; delete the
   duplicate headline ternary.
5. Add tests for each of the above (these are the gaps the current 77 tests miss).

### Step 1 — A real "demo drug" (half a day)

1. New `data/demo-drugs.json` with 2–3 synthetic entries named **Demo drug A / B / C**, each
   `notes: "Synthetic fixture — not a real drug"`, `sources: []`. Keep `data/drugs.json` untouched.
2. The picker reads this file only. No real drug names with invented numbers, ever.
3. Banner and report carry the "synthetic demo" status, so a saved report cannot be mistaken for
   sourced pharmacology.

### Step 2 — The simulator screen (2–3 days)

1. One-screen layout: inputs left, curve centre, report right (PRD §User flow), responsive stack on
   mobile.
2. A single `tNow` value (one source of truth) + slider + play/pause + speed, driven by
   `requestAnimationFrame`; a vertical cursor on the chart with "concentration at this time".
3. Dose markers on the chart; add/remove/clamp doses; validation with per-field messages,
   `aria-invalid`, `role="alert"`.
4. Report updates at the cursor (window metrics stay labelled "over the simulated window").
5. Always-visible disclaimer and placeholder banner.

### Step 3 — Accounts and saving (1 day)

1. Fix `saveReport` payload; add a report list and per-report + delete-all UI, **or** remove the
   "can be deleted at any time" claims.
2. Fix sign-in copy ("simulator is the next build step" → link to `/simulator`); remove the Google
   button until `/auth/callback` exists, or build the callback route (half a day).
3. Add a save error state with a retry.

### Step 4 — Interactions, honestly empty (half a day)

With ≥2 demo drugs, run every pair through `lookupInteraction` and show **"Not in our small verified
set"**. Add one real, cited pair only after you approve the source; no fabricated default.

### Step 5 — Validation milestone (the one that matters for the pitch)

1. Source caffeine, paracetamol and ibuprofen (ka, F, CL, V, label range) from PK-DB and labels, each
   with a citation; you approve before they enter `data/drugs.json`.
2. Digitise published curves; run the 20% Cmax/t½ check; publish results either way.
3. Cross-check one drug against `chi` or PK-Sim.

### Step 6 — Body view and AI summary (after v1)

- Body view: SVG organs driven by the same `tNow` (TRD §Frontend). Defer the 3D/GLB body until the
  2D mapping is right.
- AI summary: wire it only after H5 (auth + shared quota) is fixed; otherwise leave it off.

**Definition of done for this milestone:** a signed-out user lands on the site, sees the disclaimer,
clicks "Simulator", picks Demo drug A, adds two doses, scrubs/plays the curve, reads the report, and
can save it if signed in — with no invented data anywhere and every page carrying the fixed
disclaimer.

---

## 9. Decisions I need from you

1. **Demo drug naming** — "Demo drug A/B/C" (recommended: impossible to confuse with a real drug) or
   a single "Example PK drug"?
2. **Accounts vs PRD** — should I rewrite the PRD/TRD to match the accounts that exist (recommended),
   or remove accounts from the app?
3. **Delete reports** — build list + delete UI now, or delete the claim from `/signin` and
   `/how-it-works`?
4. **Google sign-in** — remove the button until the callback exists (recommended), or add the callback
   now?
5. **Landing CTA** — one primary button in the hero going to `/simulator`, leaving the nav at exactly
   three items (recommended; your nav requirement rules out a fourth link)?
6. **`/demo`** — delete the orphan route and its 459-line wordmark, or keep it for a future demo?
7. **AI summary** — keep the route deployed (with auth/quota work) or leave it unused for now?
8. **Real drugs** — which two join caffeine/paracetamol/ibuprofen, and do you want the parameter
   sourcing as cited *candidates* for your approval next?

---

## 10. What I changed for this review

Only review material — no product code:

- Cloned 23 reference repos into `reference/` (ignored); the OpenFDA clone was later deleted (22 remain).
- Added `reference/` to `.gitignore`.
- Created `reference/NOTES.md`.
- Created this `REVIEW.md`.
- Created `docs/REVIEW-PACKET.md` — a self-contained copy of the commissioning context, the exact
  prompts given to each review agent, and what each returned, so a separate reviewer can audit the
  review without this chat.

`git status` shows exactly: modified `.gitignore`, untracked `REVIEW.md`. The notes file sits inside
the ignored `reference/` folder, so it stays local only — tell me if you want it force-added instead.

**Stopping here for your approval, as instructed.**

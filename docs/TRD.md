# TRD: Drug-in-Body Simulator MVP

Nov 8, 2026 · @Jay

## Technical overview

The app runs in the browser: a TypeScript engine solves a small set of ODEs for 3-5 drugs, draws the curve and body view, and builds the report. The only optional network call is an AI summary through a serverless functi- and two-compartment models, population-average results, no accounts, no stored person. Python is used offline on Days 1-3 to build and validate the model and the parameter file.on. Python is used offline on Days 1-3 to build and validate the model and the parameter file.

Scope matches the PRD: one onal data. A full PBPK model is out of scope; open-source PBPK tools are listed where they help as references or cross-checks.

## System architecture

&#91;embedded content: system architecture · 7 components\]

The browser holds everything needed for the demo. Drug and interaction data are static JSON files; the AI summary is the only network call, and it is optional.

## Tech stack

The stack is a proposal chosen for speed in a 15-day build; swap any row you prefer.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | Fast setup, typed engine code |
| Simulation | Closed-form single dose plus a small RK4 ODE solver | Runs in the browser; handles multi-dose events |
| Charts | Plain SVG or a small chart library | Needs a live cursor tied to the time slider |
| Body view | Custom SVG organs | Existing body libraries are muscle maps, not organs |
| Offline model | Python, NumPy, SciPy, notebooks | Validate before porting to TypeScript |
| Cross-check | PK-Sim or Chi | Independent solver for the same parameters |
| Data | JSON files in the repo | No database needed for 3-5 drugs |
| AI summary | Serverless function calling the Claude API | Keeps the API key off the client |
| Hosting | Static host plus one function | Simple deploy |

## Pharmacokinetic model

The core is a one-compartment model with a gut depot and first-order absorption; a second compartment is added only for drugs that need it.

```latex
\frac{dA_g}{dt} = -k_a A_g
\frac{dA}{dt} = F k_a A_g - \frac{CL}{V} A
C(t) = \frac{A(t)}{V}
```

A\_g is the amount in the gut, A the amount in the body, k\_a the absorption rate, F bioavailability, CL clearance and V volume of distribution.

- **Covariates:** V scales with body weight, as in a published teaching simulator that uses the same one-compartment form. Any age or sex effect is added per drug only when a source supports it.
- **Multi-dose:** each dose adds to A\_g at its time, and the solver steps through the events.
- **Outputs:** Cmax, Tmax, and time to clear, defined as the time concentration falls below 5% of Cmax (proposed definition).
- **Assumptions:** linear kinetics and a healthy adult. Clearance varies a lot between people and can depend on dose, so doses stay within the label range.

Open-source references for this layer:

- [DavAug/chi](https://github.com/DavAug/chi): Python PKPD and PBPK simulation with dosing regimens and population variability.
- [kestrel99/pmxTools](https://github.com/kestrel99/pmxTools): closed-form concentration formulas for one-, two- and three-compartment models, useful to unit-test the solver.
- [benjaminrich/linpk](https://github.com/benjaminrich/linpk): R package with repeated-dose profiles and a Shiny demo, useful as a reference output.
- [peytoncchen/PK-Visualization](https://github.com/peytoncchen/PK-Visualization): compartment-model plotter to borrow UI ideas from.
- [Open-Systems-Pharmacology/PK-Sim](https://github.com/Open-Systems-Pharmacology/PK-Sim) and the [Suite](https://github.com/Open-Systems-Pharmacology/Suite): free whole-body PBPK tooling (GPLv2) to cross-check curves; its ospsuite R package can batch-run simulations.
- [pkpdsim docs](https://matthiaskoenig.github.io/pkpdsim): PBPK building blocks in SBML; a post-MVP path to richer models.

## Drug data schema and sources

Each drug is one JSON object in `data/drugs.json`. Values come from sources, never from memory; every parameter carries its source.

```json
{
  "id": "caffeine",
  "name": "Caffeine",
  "route": "oral",
  "model": "one-compartment",
  "ka_per_h": 0,
  "F": 0,
  "CL_L_per_h_per_kg": 0,
  "V_L_per_kg": 0,
  "label_dose_range_mg": [0, 0],
  "sources": ["pk-db study id", "drug label url"],
  "notes": ""
}
```

The zeros are placeholders to fill on Day 1.

| Source | What it gives | Notes |
| --- | --- | --- |
| [matthiaskoenig/pkdb](https://github.com/matthiaskoenig/pkdb) (PK-DB) | Curated clinical PK data, parameters and subject details via REST API | Code is LGPL-3.0; read its terms of use for data; covers caffeine and paracetamol |
| Drug labels and papers | Dose ranges, half-life, bioavailability | Open the label or paper and record the citation |
| [mims-harvard/TDC](https://github.com/mims-harvard/TDC) | ML-ready ADMET sets including volume of distribution, half-life and clearance | Useful as a sanity range, not as a single-drug source |
| [Open-Systems-Pharmacology DDI model repos](https://github.com/Open-Systems-Pharmacology/Erythromycin-Alfentanil-DDI) | Published PK-Sim models of specific drug pairs with observed data | Examples of validated interaction models; see also the Probenecid-Furosemide and Itraconazole-Felodipine repos |

## Interaction engine

In the MVP, interactions are warnings, not simulations: the engine flags known pairs and does not change the curves.

- **Data:** `data/interactions.json`, one object per verified pair with drug A, drug B, severity (major, moderate or minor, the levels DDInter uses), a mechanism note and a source.
- **Logic:** with two or more drugs selected, look up every pair and pass hits to the report. A miss shows "no entry in our small verified set", never "no interaction".
- **Stretch:** where a published change in clearance exists, apply it as a multiplier, only with a cited source. The Open-Systems-Pharmacology DDI repos show validated examples.
- **Candidate sources:** DDInter, openFDA label text and RxNav. Each pair is checked by hand before it ships.

Repos that help:

- [biothings/DDInter](https://github.com/biothings/DDInter): DDInter data plugin using the eight downloadable CSV sheets. The data is CC BY-NC-SA 4.0, so keep the app non-commercial and attribute it.
- [B2707/umraa](https://github.com/B2707/umraa): a drug-safety agent that combines RxNav, openFDA, DDInter, Beers and ACB into cited answers with a verifier step; a good design reference for "only show cited results".
- [indiser/Rxcheck](https://github.com/indiser/Rxcheck): interaction checker with an openFDA ingestion pipeline and an RxNorm proxy.
- [pcmedsinge/fhir-mcp-suite](https://github.com/pcmedsinge/fhir-mcp-suite): MCP server with drug lookup, interaction and dose checks on the RxNav API, no API key needed.
- [yubin-park/pharmpy](https://github.com/yubin-park/pharmpy): Python helper for FDA NDC, ATC and RxNav calls; old, so treat it as a reference.

## Frontend: charts, body view and animation

One store holds the body profile, the drug list and the dose events; any change reruns the engine (debounced) and every view reads the result.

- **Time slider:** one value drives the chart cursor, the body view and the report highlights, so they never disagree.
- **Playback:** a requestAnimationFrame loop advances simulated time at an adjustable speed, with play, pause and scrub.
- **Curve chart:** SVG line with dose markers and a shaded "cleared" zone.
- **Body view:** a custom SVG with gut, liver, blood and kidney regions. Gut fill follows the depot amount, blood follows concentration, and liver and kidney follow the elimination rate. This mapping is illustrative and labelled that way.
- **Accessibility:** values are printed next to colours, so meaning never rests on colour alone.

Repos that help:

- [giavinh79/react-body-highlighter](https://github.com/giavinh79/react-body-highlighter): clickable SVG body with an anterior and posterior view. It highlights muscles, not organs, so use it for the interaction pattern and draw organs yourself.
- [lahaxearnaud/body-highlighter](https://github.com/lahaxearnaud/body-highlighter): a framework-free fork of the same idea with no runtime dependencies.
- [peytoncchen/PK-Visualization](https://github.com/peytoncchen/PK-Visualization): layout ideas for a compartment-model plotter.

## Report, AI summary, agents and skills

The report is built in code from the engine output: peak, time to peak, time to clear and any interaction warning. The AI summary only rewrites those facts in plain language.

**Summary guardrails**

- The serverless function sends only the engine's numbers and the matched warnings, never free user text.
- The prompt forbids dosing advice and any number not in the input.
- The reply is checked: every number must appear in the input and no banned phrase may appear; otherwise the app shows a fixed template instead.

**Dev-time agents (proposed)**

Three Claude Code subagents can speed up Days 1-3 and 11. Each returns candidates with citations, and a human checks them before anything enters the data files.

- **Parameter sourcer:** finds ka, F, CL, V and label dose ranges for a drug, with the source for each.
- **Interaction verifier:** checks a drug pair against DDInter and the label text and returns severity, mechanism and a citation.
- **Curve validator:** runs the engine against digitized published points and reports peak and half-life error.

Repos that help:

- [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills): large skill collection covering DrugBank, ChEMBL, TDC, RDKit and other databases.
- [jaechang-hits/SciAgent-Skills](https://github.com/jaechang-hits/SciAgent-Skills): life-science skills, including a DDInter skill that other skills in the set point to for label and adverse-event data.
- [anthropics/life-sciences](https://github.com/anthropics/life-sciences): Anthropic's Claude Code marketplace of life-science MCP servers and skills (PubMed and others).
- [Augmented-Nature/ChEMBL-MCP-Server](https://github.com/Augmented-Nature/ChEMBL-MCP-Server) and [OpenFDA-MCP-Server](https://github.com/Augmented-Nature/OpenFDA-MCP-Server): MCP servers for compound, ADMET, label and adverse-event lookups.
- [medical-mcps on PyPI](https://pypi.org/project/medical-mcps/): one MCP server wrapping ChEMBL, OpenFDA, PubMed, ClinicalTrials.gov and more.
- [snap-stanford/biomni](https://github.com/snap-stanford/biomni): a general biomedical agent for drug work including ADMET prediction; heavy to set up (conda, API keys), so use it as a reference rather than a dependency.
- [anthropics/skills](https://github.com/anthropics/skills): Anthropic's skills repo, a reference for writing our own skill for this project.

## Validation and testing

The curves are only trusted once they pass these checks. Pass thresholds are proposals to confirm.

| Check | Method | Pass rule |
| --- | --- | --- |
| Single dose vs closed form | Unit test | Within 1% |
| Mass balance | Unit test | Absorbed = in body + eliminated |
| Multi-dose superposition | Unit test | Equals sum of single-dose curves (linear model) |
| Published curves | Digitized points from PK-DB or papers | Peak and half-life within about 20% |
| Cross-solver | PK-Sim or Chi on the same parameters | Curves overlap |
| Demo path | Browser smoke test | Passes 3 runs in a row |
| Interaction pairs | Manual check against the label | Every pair has a citation |
| Copy lint | Script | No banned phrases in the UI or summary |

## Safety and privacy implementation

- A fixed disclaimer component renders on every screen and cannot be dismissed.
- A copy-lint script fails the build on banned phrases such as "safe dose" or "recommended dose".
- The AI summary is filtered as described above, with a template fallback.
- The body profile lives in browser memory only; nothing is stored or sent except the numbers in a summary request.
- The Claude API key stays in the serverless function, which is rate-limited.
- A footer lists data sources and carries the DDInter attribution and non-commercial notice.
- Interaction misses never say "safe"; they say the pair is not in the verified set.

## Deployment and repo structure

The app deploys as a static site plus one serverless function; CI runs the engine tests and the copy lint on every push.

```text
apps/web/          React app (views, store, body SVG)
packages/engine/   TypeScript PK engine and tests
data/              drugs.json, interactions.json, sources.md
notebooks/         Python model and validation
api/summary/       serverless AI summary function
docs/              PRD and TRD
```

## Day-by-day build plan and technical risks

| Day | Work | Output |
| --- | --- | --- |
| 1 | Pick drugs, collect parameters with sources | `drugs.json` draft |
| 2 | Python one-compartment model with oral absorption | First curves |
| 3 | Validate vs published curves; choose interaction pairs | Validation notebook |
| 4 | Scaffold app; port engine to TypeScript | Engine and tests |
| 5 | Input panel and store | Working inputs |
| 6 | Curve chart and time slider | Live chart |
| 7 | Multi-dose events | Stacked doses work |
| 8 | Playback and polish | Web app milestone |
| 9 | Body SVG organs | Static body view |
| 10 | Link body to simulation state; animate | Animated demo |
| 11 | Interaction warnings | Verified pairs shown |
| 12 | Report panel | Peak, clear time, warnings |
| 13 | AI summary and guardrails | Safe summary or fallback |
| 14 | Disclaimer, copy lint, tests | Release candidate |
| 15 | Bug fixes and demo video | Demo |

Technical risks

- **Parameter sourcing takes longer than Day 1.** Fallback: ship 3 drugs instead of 5.
- **Curves fail validation.** Fallback: add the second compartment or narrow the dose range.
- **Organ animation takes too long.** Fallback: highlight three zones only.
- **Interaction data licence blocks use.** Fallback: hand-write pairs from drug labels.
- **AI summary slips.** Fallback: ship the template report; it is already the default path.

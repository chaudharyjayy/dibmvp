# PRD: Drug-in-Body Simulator MVP

Nov 8, 2026 · @Jay

## Overview

A web app that simulates how a drug moves through a virtual human body and turns the result into a plain-language report. The user enters a body profile, picks a drug and dose, and watches concentration curves and organ activity update in real time. Working title: Drug-in-Body Simulator.

Problem: full PBPK tools such as Simcyp and GastroPlus are licensed industry software, and digital twins like ExactCure target clinics and pharma. This MVP targets learners and curious users who want a simple, visual view of what a dose does over hours, including stacked doses and combinations.

The MVP is an educational simulator built in 15 days. It is not a medical device and gives no dosing advice.

## Goals and non-goals

Goals

- Simulate 3-5 common drugs with a one- or two-compartment model for a given age, weight and sex.
- Show a live, animated concentration curve plus a body diagram where organs light up as the drug moves.
- Generate a report: peak level, time to peak, time to clear, and warnings for stacked doses or known interactions.
- Ship a demo-ready web app within 15 days.

Non-goals

- A full human digital twin or whole-body PBPK model.
- Detecting what drugs a real person has taken (that needs lab tests or sensors).
- Personalized medical or dosing advice.
- User accounts, native mobile apps, or genetics-based personalization.

## Target users

- **Students and learners** (pharmacy, biology, health): want to see how dose and half-life shape a curve.
- **Curious everyday users**: want to understand what caffeine or a painkiller does over a day.
- **Reviewers and mentors**: need a clear two-minute demo of the idea.

## User stories

- As a student, I enter my weight and a caffeine dose so I can see when the level peaks and when it falls off.
- As a user, I add a second dose a few hours later so I can see how stacking changes the curve.
- As a user, I pick two drugs so I can see whether a known interaction warning applies.
- As a reviewer, I press play so I can watch the drug move through the body in a short demo.
- As a user, I read a plain-language report so I understand the result without reading a graph.

## MVP features

Nine features ship; the first six are the core demo.

| Feature | Priority | Notes |
| --- | --- | --- |
| Body profile input (age, weight, sex) | Must | Scales volume of distribution and clearance |
| Drug and dose picker (3-5 drugs) | Must | Fixed list, no free-text drugs |
| One- or two-compartment PK engine in the browser | Must | No backend needed for the simulation |
| Live concentration curve with play, pause and time slider | Must | Updates as inputs change |
| Multi-dose scheduling | Must | Lets users stack doses |
| Report: peak, time to peak, time to clear | Must | Shown beside the curve |
| Animated body view with organs lighting up | Should | Custom SVG; gut, liver, blood, kidney |
| Interaction warnings for hand-checked drug pairs | Should | Source data licence must be checked |
| AI plain-language summary | Could | Wraps the numbers from the engine, never invents them |
| Export report as image or PDF | Could | Post-demo polish |

Out for the MVP: accounts, saved sessions, sharing, mobile app.

## User flow and screens

The app is one screen with a left input panel, a centre body view, and a right results panel.

1. The user lands on the page and reads the one-line disclaimer.
2. The user enters age, weight and sex.
3. The user picks a drug, a dose and a start time, and can add more doses.
4. The user presses play; the concentration curve draws and organs light up as the drug moves.
5. The user drags the time slider to inspect any hour.
6. The report panel shows peak level, time to peak, time to clear, and any interaction warning.
7. Optional: the user taps "Explain" to get a plain-language summary.

## Supported drugs and interactions

The MVP covers 3-5 drugs, chosen because they are common and well studied. Parameters come from published sources and are checked against published curves before shipping.

| Drug | Why it is in | Parameter source |
| --- | --- | --- |
| Caffeine | Familiar to everyone; PK-DB holds caffeine data | PK-DB, papers |
| Paracetamol | Very common; PK-DB holds paracetamol data | PK-DB, drug label |
| Ibuprofen | Common painkiller; good for a stacking demo | Drug label, papers |
| Two more (TBD) | Picked on Day 3 once the model works | To be sourced |

Interaction warnings cover only a small hand-checked set of pairs, chosen on Day 3 from DDInter and openFDA label text. Each pair is verified by hand before it ships.

## Success metrics

The MVP succeeds if the demo runs cleanly and the curves look right. These targets are proposals to confirm.

| Metric | Target |
| --- | --- |
| Peak and half-life vs published curves, per drug | Within about 20% |
| Time from page load to first curve | Under 30 seconds |
| Simulation response time per input change | Under 1 second |
| Two-minute demo run without errors | 3 clean runs in a row |
| Drugs shipped | 3-5 |

## Safety, disclaimers and ethics

The app must never read as medical advice, because people may act on what they see.

- A disclaimer is visible on every screen: educational simulator, population averages, not dosing advice.
- No "safe dose" or "recommended dose" wording anywhere, including in AI summaries.
- Results are population-average estimates; the report says so.
- No personal data is stored; the body profile stays in the browser.
- Interaction data is limited to a small verified set, and its licence is checked before use (DDInter data is non-commercial).
- The AI summary may only rephrase numbers the engine produced.

## 15-day timeline

&#91;embedded content: 15-day plan · 5 phases\]

Read left to right: each phase hands a working piece to the next, and the demo video is recorded on Day 15.

## Risks, open questions and roadmap

Risks

- **Accuracy:** population-average curves differ from any real person. Mitigation: validate against published curves and say so in the report.
- **Interaction data:** DDInter data is licensed CC BY-NC-SA 4.0, so non-commercial only. Mitigation: keep a small hand-verified set and check licences before any commercial use.
- **Scope creep:** a full PBPK model is out of reach in 15 days. Mitigation: stay with one- and two-compartment models.
- **Misread as dosing advice:** mitigated by the disclaimer and by banning "safe dose" wording.

Open questions

- Which two drugs complete the set of 3-5?
- Is this for a competition or demo day? That changes the demo script and licensing.
- Is the AI summary needed for the demo or can it be cut?

After the MVP

- Move from simple compartments to richer PBPK models using the open-source tools listed below.
- Let an agent pull drug label and interaction data through MCP servers instead of hand-coded pairs.
- Add more drugs, and optional lab-value input.

## Open-source building blocks

These repos can speed up the build. I found them through web search and have not cloned or tested them, so check licence and activity before relying on one.

| Area | Repo | Use here |
| --- | --- | --- |
| PK modelling | [Open-Systems-Pharmacology/PK-Sim](https://github.com/Open-Systems-Pharmacology/PK-Sim) | Free whole-body PBPK tool (GPLv2); use it to cross-check our curves |
| PK modelling | [Open-Systems-Pharmacology/Suite](https://github.com/Open-Systems-Pharmacology/Suite) | PK-Sim and MoBi suite with an R package to run simulations |
| PK modelling | [DavAug/chi](https://github.com/DavAug/chi) | Python package for PKPD and PBPK simulation of dosing regimens |
| PK modelling | [pkpdsim docs](https://matthiaskoenig.github.io/pkpdsim) | PBPK building blocks in SBML; a post-MVP option |
| PK modelling | [peytoncchen/PK-Visualization](https://github.com/peytoncchen/PK-Visualization) | Compartment-model calculator and plotter to borrow ideas from |
| PK modelling | [benjaminrich/linpk](https://github.com/benjaminrich/linpk) | R package for concentration-time profiles with repeated dosing |
| PK data | [matthiaskoenig/pkdb](https://github.com/matthiaskoenig/pkdb) | Open pharmacokinetics database with a REST API; parameter source |
| Interactions | [biothings/DDInter](https://github.com/biothings/DDInter) | DDInter data plugin; data is non-commercial (CC BY-NC-SA 4.0) |
| Interactions | [B2707/umraa](https://github.com/B2707/umraa) | Drug-safety agent using RxNav, openFDA, DDInter with cited answers |
| Interactions | [indiser/Rxcheck](https://github.com/indiser/Rxcheck) | Interaction checker with openFDA ingestion; UI reference |
| Interactions | [pcmedsinge/fhir-mcp-suite](https://github.com/pcmedsinge/fhir-mcp-suite) | MCP server for drug lookup and interaction checks via RxNav |
| Drug data | [mims-harvard/TDC](https://github.com/mims-harvard/TDC) | ML-ready ADMET and DDI datasets; later use |
| Agents | [snap-stanford/biomni](https://github.com/snap-stanford/biomni) | General biomedical AI agent; heavy, use as reference |
| Agent skills | [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills) | Skills for DrugBank, ChEMBL, TDC, RDKit and more |
| Agent skills | [jaechang-hits/SciAgent-Skills](https://github.com/jaechang-hits/SciAgent-Skills) | Life-science skills including a DDInter skill |
| Agent skills | [anthropics/life-sciences](https://github.com/anthropics/life-sciences) | Official Claude Code marketplace of life-science MCP servers and skills |
| MCP servers | [Augmented-Nature/ChEMBL-MCP-Server](https://github.com/Augmented-Nature/ChEMBL-MCP-Server) | Drug and ADMET lookups for an agent |
| MCP servers | [Augmented-Nature/OpenFDA-MCP-Server](https://github.com/Augmented-Nature/OpenFDA-MCP-Server) | FDA drug labels and adverse events for an agent |
| Body visual | [giavinh79/react-body-highlighter](https://github.com/giavinh79/react-body-highlighter) | Clickable SVG body; muscles only, so organs need custom SVG |
| Body visual | [lahaxearnaud/body-highlighter](https://github.com/lahaxearnaud/body-highlighter) | Framework-free version of the same idea |

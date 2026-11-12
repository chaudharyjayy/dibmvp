# Design direction — the landing page

Direction C, "HUD": a dark instrument panel. The page reads like a medical
scanner's display — a deep blue-black base, a cyan accent for the one
interactive thing on screen, hairline structure, and a hologram of a human
whose organs light up as the level rises.

This replaces direction B, the white editorial page. The change was the
owner's call; the rules below are what the page is now held to.

## Palette

Every text pair below was computed, not estimated.

| Token | Value | Role | vs `--bg` | vs `--surface` |
| --- | --- | --- | --- | --- |
| `--bg` | `#05070c` | page base | — | — |
| `--surface` | `#0c1119` | panels, the dial strip | 1.07 | — |
| `--surface-2` | `#111825` | raised surfaces | 1.17 | 1.09 |
| `--line` | `#1d2937` | decorative hairline | 1.42 | 1.34 |
| `--line-strong` | `#4a637d` | meaningful borders, the dial track | **3.24** | **3.04** |
| `--ink` | `#e9eff8` | primary text | **17.43** | **16.37** |
| `--ink-2` | `#a7b8cc` | secondary text | **9.95** | **9.34** |
| `--ink-3` | `#7d8fa5` | tertiary text | **6.09** | — |
| `--accent-fill` | `#22d3ee` | the accent: the dial, the CTA | **11.15** | **10.47** |
| `--accent-text` | `#67e8f9` | accent as text | **13.90** | **13.05** |
| `--warn` | `#f59e0b` | interaction warnings only | **9.38** | 8.81 |

Rules that come with it:

- Never white text on an accent fill: the CTA is dark ink `#04121a` on cyan
  (10.5:1).
- `--line` is decoration. A boundary that carries meaning — the dial track,
  a control's edge — uses `--line-strong` and clears 3:1.
- `--warn` is reserved for interaction warnings. It is never decoration.
- No pure black: the base is a blue-black, because light text on true black
  halates.

## The devices

Three, and only three. The genre fails when every element wears the costume.

1. **The reticle.** A HUD marker that locks onto whichever organ currently
   holds the highest drug level, with a leader line and a mono readout
   (`KIDNEY · MODEL 0.82`). It is the only HUD on the page that carries
   information, and the number is read from the model's own levels — it is
   labelled "model" so it cannot be mistaken for live patient telemetry.
2. **Corner brackets.** Two pseudo-elements on the figure frame.
3. **A hairline grid.** One `repeating-linear-gradient` layer, masked so it
   fades out, plus two soft colour glows and an edge vignette. All of it is
   generated in CSS — the page ships no images and no video.

The scan band on the body and the scanner sweep across the canvas are the
same idea seen twice: one travels down the figure in the shader, one crosses
the canvas in CSS. Both stop under `prefers-reduced-motion`.

## Type

- Geist Sans for everything a person reads: headings, body, phase titles.
- Geist Mono for data only: hour readouts, the reticle label, axis labels,
  the caption style (12/16, uppercase, `tracking-[0.08em]`, `tabular-nums`).
- Body copy never gets a glow, and never gets set in mono.

## What this genre must not do here

- **No fake telemetry.** A HUD that implies live clinical readings on an
  educational simulator is deception. Every readout is derived from the
  model, and the "illustrative" labels stay on screen.
- **No flicker.** Nothing flashes faster than 3×/second (WCAG 2.3.1).
  Photosensitive epilepsy affects roughly 1 in 4,000 people, and a medical
  page that flickers is a credibility problem as well as a safety one.
- **No glow on body copy.** It blurs the glyph edges and costs contrast.
- **No all-cyan page.** Cyan is for structure and the one interactive
  element. Everything else is a neutral on the dark base.
- **No shadows for elevation.** They are invisible on a dark panel; the
  hierarchy comes from borders and surface steps instead.

## Where the theme stops

The landing page, the simulator and the fixed disclaimer are dark. The
sign-in panel and the other routes keep the light shadcn theme: the landing
page and the simulator are the two surfaces that carry the model, and the
disclaimer is dark everywhere because it is fixed chrome on every route.

## The simulator

The simulator is the same instrument panel as the landing page, turned to
work. The rules below are what it is held to; the palette, the type and the
devices above are shared with the landing and are not restated.

### The layout

Three columns on a desktop, and the model is the middle one:

1. **Left — the inputs.** The condition, the description, the profile, the
   dose schedule, and the button that runs it. The panel scrolls on its own
   so the inputs never push the model off screen.
2. **Middle — the model.** The canvas, the readouts under it, and the time
   dial under those. The column is sticky: the model stays put while the
   walkthrough scrolls past it.
3. **Right — the walkthrough.** One card per step, each with the organ's
   name, what the engine's numbers say at that moment, and the numbers
   themselves.

On a phone the order inverts to model, inputs, walkthrough, and the model
becomes sticky under the bar so the camera move is always visible.

### Two controls, two jobs

- **The dial moves time.** It runs over the simulated window, and the peak
  is marked on the track. Everything drawn and every number on screen is
  read at the dial's hour, so the glow on the body and the figures in the
  narration are always the same instant.
- **The scroll moves the camera.** The step whose middle is nearest the
  middle of the screen is the step being read; the camera frames that
  organ, and it is the only organ that is lit.

The two are deliberately independent. The dial is a control; the scroll is
reading. Neither one is a way to change the dose.

### The walkthrough

- The first step is always the whole body: the camera stays on the figure
  and the numbers are the run's overall state.
- Each step after that is one organ, in the order the condition lists.
- The narration's numbers are the engine's own — the concentration, the
  amount in the gut, the amount in the blood, the clearance rate — read at
  the dial's hour. There are no other numbers on the page.
- The condition chooses which organs the walkthrough visits. It does not
  predict anything. The narration says so where it matters, and the
  wording is pinned by a test.

### Rules

- **No disease claims.** The simulator does not model diseases, does not
  say a drug treats a condition, and does not give dosing advice. The
  condition is a lens on the walkthrough, not a diagnosis.
- **The organ has to stay recognisable.** In the simulator the camera is
  close, so the drug level shows as brightness and a rim rather than
  repainting the tissue. On the landing figure, seen whole, the organ
  fills with the accent as before.
- **No floating labels over the anatomy.** The organ's name sits in the
  corner of the canvas and a small reticle marks the organ; the name never
  covers the thing it names.
- **The browser's own validation bubbles do not appear.** The panel says
  what is wrong with the input, in the panel, in the same words every time.

### The prescription input

- The console takes a prescription written like a script — `200 mg every
  8 h for 3 doses`, `500 mg once`, `100 mg at 0, 6, 12`, `250 mg q8h x3`
  — and loads it into the dose rows with **Load**. Each medicine's card
  has its own loader; the rows stay per-medicine.
- The parser is a loader, not state the engine reads. The dose rows stay
  the visible, editable source of truth; loading a script only places
  amounts at times and never invents drug properties. A bad script says
  what is missing, in the panel, not in a browser bubble.

### The medicine picker (catalogue treatments)

- Medicines come from the Supabase catalogue, not from free text. The
  search box queries the openFDA-derived ingredient list through the
  `search_drugs` RPC; hits show their pharmacokinetic status, and a
  medicine is addable only when an approved, cited `drug_pk` row exists
  (`pk sourced`). Anything else is disabled in place, showing *pk
  partial* or *pk not sourced* — the panel never runs a drug on invented
  numbers.
- One treatment holds at most five medicines. Each runs through the
  engine on its own cited parameters; the combined panel is an additive
  exposure model, labelled as such in the header and the saved summary.
  The doses, the window and the saved report keep the per-medicine
  structure.
- The label range under each medicine's name comes from the approved
  row's dose range, so the amount the visitor types can be compared with
  what the cited source studied.

### The literature strip

- Each walkthrough step carries a small strip of published papers about
  the process the step narrates, fetched straight from the browser via
  NCBI E-utilities (public endpoint, open CORS). The queries are fixed,
  field-tagged and reproducible in `lib/pubmed.ts`; a small in-memory
  cache makes one fetch per topic per session. The build has no server,
  so the strip needs no route.
- The strip follows the treatment: below the organ's papers it shows one
  section per medicine (at most three), the drug's PubMed query built
  from the catalogue name (the id is all the request carries; the name
  is resolved from the catalogue, never from visitor-typed text).

### Deployment

- The app deploys as a fully static site (`output: "export"`,
  basePath `/dibmvp`) to GitHub Pages via `.github/workflows/pages.yml`.
  There is no server: the browser talks to Supabase with the anon key
  and to PubMed's E-utilities directly, the same way sign-in and saved
  reports already worked in the browser.
- The strip loads when it scrolls into view, holds at most three papers,
  and says what it is: *context, not the model's output and not advice*.
  The engine never reads it. If PubMed is unreachable the step reads
  fine without it.


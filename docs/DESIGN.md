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

The landing page and the fixed disclaimer are dark. The simulator, the sign-in
panel and the other routes keep the light shadcn theme: the landing page is
the marketing surface, and the simulator is a working tool. The disclaimer is
dark everywhere because it is fixed chrome on every route.

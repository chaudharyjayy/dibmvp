# Data sources

## interactions.json — field reference (README for the empty file)

`data/interactions.json` is intentionally an empty array. One JSON object per
**verified** pair goes here; every pair needs a citation before it ships:

```jsonc
{
  "a": "caffeine",        // drug id, matches data/drugs.json "id"
  "b": "paracetamol",     // drug id, matches data/drugs.json "id"
  "severity": "moderate", // "major" | "moderate" | "minor" (DDInter levels)
  "mechanism": "…",       // short mechanism note
  "source": "…"           // citation: DDInter entry, openFDA label URL, paper, RxNav
}
```

Rules (from the TRD):

- Every pair is checked by hand against its citation before it ships.
- Candidate sources: DDInter (CC BY-NC-SA 4.0 — non-commercial, must attribute),
  openFDA label text, RxNav.
- A pair that is *not* in this file must be reported by the engine as
  "Not in our small verified set" — never as "no interaction" and never as safe.

## drugs.json sources table (fill in as parameters land)

| Drug | Parameter | Value | Source URL |
| ---- | --------- | ----- | ---------- |
| caffeine | ka_per_h | TODO | TODO |
| caffeine | F | TODO | TODO |
| caffeine | CL_L_per_h_per_kg | TODO | TODO |
| caffeine | V_L_per_kg | TODO | TODO |
| caffeine | label_dose_range_mg | TODO | TODO |
| paracetamol | ka_per_h | TODO | TODO |
| paracetamol | F | TODO | TODO |
| paracetamol | CL_L_per_h_per_kg | TODO | TODO |
| paracetamol | V_L_per_kg | TODO | TODO |
| paracetamol | label_dose_range_mg | TODO | TODO |
| ibuprofen | ka_per_h | TODO | TODO |
| ibuprofen | F | TODO | TODO |
| ibuprofen | CL_L_per_h_per_kg | TODO | TODO |
| ibuprofen | V_L_per_kg | TODO | TODO |
| ibuprofen | label_dose_range_mg | TODO | TODO |

Primary parameter source: [PK-DB](https://github.com/matthiaskoenig/pkdb)
(REST API; check its terms of use for data). Dose ranges: official drug label.
Sanity ranges only: [mims-harvard/TDC](https://github.com/mims-harvard/TDC).

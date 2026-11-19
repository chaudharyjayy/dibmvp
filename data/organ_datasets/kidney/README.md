# Kidney Organ Dataset (Synthetic Reference Profiles)

## What this is

Six kidney "archetypes" — a healthy baseline plus five common disease states
— with the physiological numbers your Blender model and simulation code
need to render and animate a kidney under different conditions. Files:

- `kidney_profiles.json` — the full dataset, machine-readable, with field
  definitions and the basis for each profile.
- `kidney_profiles.csv` — the same six profiles as a flat table, for quick
  loading into pandas or a spreadsheet.

## Important: this is synthetic, not patient data

There is no real patient dataset involved here, and there shouldn't be —
using real people's medical histories would raise the privacy issues
already flagged in the project brief (consent, anonymization, DPDP Act /
HIPAA / GDPR). These six profiles are built instead from the public
**KDIGO chronic kidney disease (CKD) staging system**, which defines CKD
stages G1 through G5 by eGFR range, plus standard physiology reference
ranges for a healthy adult.

Numbers inside each profile beyond the staging-defined eGFR thresholds (for
example, exact creatinine or urine albumin-to-creatinine ratio) are
illustrative midpoints for that severity level, not values pulled from a
specific study. Before using this beyond a hackathon demo, run it through a
review step like the one already built for the drug PK table: one source
URL and one quoted sentence per number you want to rely on.

## How to use this with the drug catalog

The drug catalog project (`drugs.json`, `drug_pk_public.json`, etc.)
already gives you medicine names, routes, and — once reviewed — PK
parameters (ka, bioavailability, clearance, volume of distribution). This
kidney dataset is the other half: it tells the simulation what organ it is
dosing.

A simple loop for the prototype:

1. Pick a kidney profile (for example `kidney_healthy_adult` or
   `kidney_ckd_stage4_diabetic_hypertensive`).
2. Pick a medicine with an approved PK row from `drug_pk_public`,
   especially one that is kidney-cleared or nephrotoxic (ibuprofen is the
   clearest demo case already covered in the project brief).
3. Run your PK/PD simulation using the medicine's clearance and dose,
   scaled by this profile's `clearance_scaling_factor` (how much slower the
   drug leaves the body) and `nephrotoxic_sensitivity_multiplier` (how much
   extra damage a nephrotoxic drug causes).
4. Feed the resulting time series (eGFR drifting down, drug concentration
   rising) into the Blender script that colors or deforms the kidney mesh.

This lets you show the same dose of, say, ibuprofen barely denting a
healthy kidney's eGFR while pushing a CKD stage 4 kidney closer to failure
— a strong, visual hackathon demo that pairs well with the matching lung
dataset.

## Field reference

See the `field_notes` object inside `kidney_profiles.json` for a
definition of every column. The short version:

| Field | Meaning |
|---|---|
| `egfr_ml_min_1_73m2` | Main measure of kidney function; normal is roughly 90-120 |
| `ckd_stage` | KDIGO stage, G1 (normal) through G5 (failure), defined by eGFR range |
| `serum_creatinine_mg_dl` / `bun_mg_dl` | Waste markers that rise as filtration falls |
| `urine_acr_mg_g` | Marker of structural damage; can be high even when eGFR still looks normal (early diabetic damage) |
| `nephrotoxic_sensitivity_multiplier` | Simulation scaling factor for drug-caused kidney damage, 1.0 = healthy baseline |
| `clearance_scaling_factor` | Simulation scaling factor for how fast this kidney clears a kidney-cleared drug, 1.0 = healthy baseline |

## Suggested next step for your team

Add a `source_url` and `source_quote` column to a working copy of this CSV
and start replacing illustrative values with cited ones, one profile at a
time, starting with the ones you'll actually demo.

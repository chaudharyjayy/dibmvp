# Liver Organ Dataset (Synthetic Reference Profiles)

## What this is

Six liver "archetypes" — a healthy baseline plus five common disease and
injury states — with the physiological numbers your Blender model and
simulation code need to render and animate a liver under different
conditions. Files:

- `liver_profiles.json` — the full dataset, machine-readable, with field
  definitions and the basis for each profile.
- `liver_profiles.csv` — the same six profiles as a flat table, for quick
  loading into pandas or a spreadsheet.

## Important: this is synthetic, not patient data

There is no real patient dataset involved here, and there shouldn't be —
using real people's medical histories would raise the privacy issues
already flagged in the project brief (consent, anonymization, DPDP Act /
HIPAA / GDPR). These six profiles are built instead from the public
**Child-Pugh cirrhosis staging system**, which classifies cirrhosis
severity as class A (mild, 5-6 points), B (moderate, 7-9 points) or C
(severe, 10-15 points) from bilirubin, albumin, INR, ascites and
encephalopathy, plus standard liver-function reference ranges for a
healthy adult and for acute injury.

Numbers inside each profile beyond the class-defining score ranges (for
example, exact ALT or CYP450 activity) are illustrative midpoints for that
severity level, not values pulled from a specific study. Before using this
beyond a hackathon demo, run it through a review step like the one already
built for the drug PK table: one source URL and one quoted sentence per
number you want to rely on.

## How to use this with the drug catalog

The drug catalog project (`drugs.json`, `drug_pk_public.json`, etc.)
already gives you medicine names, routes, and — once reviewed — PK
parameters (ka, bioavailability, clearance, volume of distribution). This
liver dataset is the other half: it tells the simulation what organ is
metabolizing the drug.

A simple loop for the prototype:

1. Pick a liver profile (for example `liver_healthy_adult` or
   `liver_decompensated_cirrhosis_childC`).
2. Pick a medicine with an approved PK row from `drug_pk_public`,
   especially one that is hepatically cleared or hepatotoxic (paracetamol
   is the clearest demo case already covered in the project brief).
3. Run your PK/PD simulation using the medicine's clearance and dose,
   scaled by this profile's `clearance_scaling_factor` and
   `cyp450_activity_multiplier` (how much slower the drug is metabolized)
   and `first_pass_bioavailability_multiplier` (how much MORE of an oral
   dose reaches the bloodstream when cirrhosis lets blood bypass the
   liver through shunts). Use `hepatotoxic_sensitivity_multiplier` to
   scale extra liver damage from a hepatotoxic drug.
4. Feed the resulting time series (ALT rising, drug concentration
   building up) into the Blender script that colors or deforms the liver
   mesh.

This lets you show the same paracetamol dose being handled safely by a
healthy liver while pushing a Child-Pugh C liver toward acute failure — a
strong, visual hackathon demo that pairs well with the matching lung and
kidney datasets.

## Field reference

See the `field_notes` object inside `liver_profiles.json` for a
definition of every column. The short version:

| Field | Meaning |
|---|---|
| `child_pugh_class` | A (mild), B (moderate), C (severe) cirrhosis, or none |
| `alt_u_l` / `ast_u_l` | Liver-cell-injury markers; note these can look LOWER in Child-Pugh C than B because so little liver tissue remains to release them |
| `total_bilirubin_mg_dl` / `albumin_g_dl` / `inr` | The three lab values Child-Pugh scoring is partly built from |
| `cyp450_activity_multiplier` | Simulation scaling factor for drug metabolism speed, 1.0 = healthy baseline |
| `first_pass_bioavailability_multiplier` | Simulation scaling factor for how much more oral drug reaches the blood due to portal shunting |
| `clearance_scaling_factor` | Simulation scaling factor for hepatic drug clearance, 1.0 = healthy baseline |
| `hepatotoxic_sensitivity_multiplier` | Simulation scaling factor for drug-caused liver damage, 1.0 = healthy baseline |

## Suggested next step for your team

Add a `source_url` and `source_quote` column to a working copy of this CSV
and start replacing illustrative values with cited ones, one profile at a
time, starting with the ones you'll actually demo.

# Lung Organ Dataset (Synthetic Reference Profiles)

## What this is

Six lung "archetypes" — a healthy baseline plus five common smoking- and
disease-related states — with the physiological numbers your Blender model
and simulation code need to render and animate a lung under different
conditions. Files:

- `lung_profiles.json` — the full dataset, machine-readable, with field
  definitions and the basis for each profile.
- `lung_profiles.csv` — the same six profiles as a flat table, for quick
  loading into pandas or a spreadsheet.

## Important: this is synthetic, not patient data

There is no real patient dataset involved here, and there shouldn't be —
using real people's medical histories would raise the privacy issues
already flagged in the project brief (consent, anonymization, DPDP Act /
HIPAA / GDPR). These six profiles are built instead from public, well-known
clinical staging systems:

- **GOLD staging** for COPD severity (based on FEV1/FEV1 ratio and FEV1 %
  predicted).
- **Standard physiology reference ranges** for a healthy adult.
- **Known distinguishing patterns** for asthma (reversible, normal DLCO) vs.
  COPD (irreversible, reduced DLCO) vs. pulmonary fibrosis (restrictive
  pattern: FEV1/FVC normal or high, DLCO sharply reduced).

Numbers inside each profile beyond the staging-defined thresholds (for
example, exact SpO2 or tidal volume) are illustrative midpoints for that
severity level, not values pulled from a specific study. Before using this
beyond a hackathon demo, run it through a review step like the one already
built for the drug PK table: one source URL and one quoted sentence per
number you want to rely on.

## How to use this with the drug catalog

The drug catalog project (`drugs.json`, `drug_pk_public.json`, etc.)
already gives you medicine names, routes, and — once reviewed — PK
parameters (ka, bioavailability, clearance, volume of distribution). This
lung dataset is the other half: it tells the simulation what organ it is
dosing.

A simple loop for the prototype:

1. Pick a lung profile (for example `lung_healthy_adult` or
   `lung_severe_copd_emphysema`).
2. Pick a medicine with an approved PK row from `drug_pk_public`.
3. Run your PK/PD simulation using the medicine's clearance, half-life, and
   dose, with this profile's `airway_resistance_multiplier`,
   `vq_mismatch_index`, and `respiratory_drive_sensitivity` scaling how the
   drug's effect translates into SpO2, breathing rate, and airway
   resistance over time.
4. Feed the resulting time series into the Blender script that colors or
   deforms the lung mesh.

This lets you show the same medicine (for example an opioid, or a
bronchodilator) producing a mild change in a healthy lung and a much larger
or more dangerous change in a COPD or fibrosis lung — which is a strong,
visual hackathon demo.

## Field reference

See the `field_notes` object inside `lung_profiles.json` for a definition
of every column. The short version:

| Field | Meaning |
|---|---|
| `fev1_pct_predicted` | Airflow in the first second of a forced exhale, as % of a healthy predicted value |
| `fvc_pct_predicted` | Total forced exhale volume, as % of a healthy predicted value |
| `fev1_fvc_ratio` | Below ~0.70 signals obstruction (COPD, asthma); normal or high with low FVC signals restriction (fibrosis) |
| `spo2_rest_pct` / `spo2_exertion_pct` | Blood oxygen saturation at rest and under mild exertion |
| `dlco_pct_predicted` | How well gas crosses into blood — the key number that separates asthma (normal) from COPD/fibrosis (reduced) |
| `airway_resistance_multiplier` | Simulation scaling factor, 1.0 = healthy baseline |
| `vq_mismatch_index` | 0 to 1, higher = more wasted ventilation |
| `respiratory_drive_sensitivity` | How strongly breathing responds to CO2/O2 and to respiratory-depressant drugs; lower = blunted |

## Suggested next step for your team

Add a `source_url` and `source_quote` column to a working copy of this CSV
and start replacing illustrative values with cited ones, one profile at a
time, starting with the ones you'll actually demo.

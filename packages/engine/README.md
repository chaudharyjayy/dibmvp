# Engine

Framework-free PK engine: `simulate`, `closedFormSingleDose`, `buildReport`, `lookupInteraction`. Pure functions — JSON in / JSON out — usable in the browser or Node.

## Usage

```ts
import { simulate, buildReport, lookupInteraction } from '@dib/engine';

const result = simulate({
  profile: { ageYears: 30, weightKg: 70, sex: 'M' },
  drug: { id: 'x', name: 'Fixture', model: 'one-compartment', ka_per_h: 1.0, volume_per_kg_l: 5, clearance_per_kg_l_per_h: 0.7 },
  doses: [{ drugId: 'x', doseMg: 100, timeH: 0 }],
  tEndH: 24,
  dtH: 0.05,
});

const report = buildReport(result);       // headline/bullets/disclaimer template
const hit = lookupInteraction('a', 'b', []); // { found:false, message:'Not in our small verified set' }
```

`Drug` numeric parameters in `data/drugs.json` are `null` until sourced from PK-DB/official labels; the engine throws clearly if required parameters are missing.

# Copy rules — banned-phrase list companion

Product copy must never contain dosing-advice phrasing. The lint source of
truth lives in `.banned-phrases` (one phrase per line); this is the summarised
rule set from the PRD/TRD:

- banned: "safe dose"-style wording, "recommended dose"-style wording,
  "take this many"-style advice;
- the disclaimer text is always: "Educational simulator. Population-average
  estimate. Not medical or dosing advice." (wording fixed in
  `packages/engine/buildReport.ts`);
- interaction misses are always "Not in our small verified set"
  (wording fixed in `packages/engine/lookupInteraction.ts`), never implying
  that an unknown pair is harmless;
- the AI summary must use only numbers present in the engine's input.

Run the check with `npm run lint:copy`.

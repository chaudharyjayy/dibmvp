/**
 * Medicine suggestions for the condition the visitor picked.
 *
 * These are teaching examples, not treatment advice: the simulator does not
 * model diseases, so nothing here claims a medicine treats a condition. It
 * only offers a starting medicine to explore in the PK model.
 *
 * Every id below is one of the medicines whose pharmacokinetics have a sourced
 * and approved catalogue row, so every suggestion can actually be simulated.
 * Conditions with no such medicine get an empty list and the UI says so,
 * rather than offering a name the engine cannot run.
 */

export type SuggestedMedicine = {
  id: string;
  name: string;
};

const ACETAMINOPHEN: SuggestedMedicine = { id: "acetaminophen", name: "Acetaminophen" };
const IBUPROFEN: SuggestedMedicine = { id: "ibuprofen", name: "Ibuprofen" };
const AMOXICILLIN: SuggestedMedicine = { id: "amoxicillin", name: "Amoxicillin" };
const GABAPENTIN: SuggestedMedicine = { id: "gabapentin", name: "Gabapentin" };
const CAFFEINE: SuggestedMedicine = { id: "caffeine", name: "Caffeine" };

/** Commonly encountered examples, by condition id, from the PK-backed set. */
export const SUGGESTED_MEDICINES: Readonly<Record<string, readonly SuggestedMedicine[]>> = {
  general: [ACETAMINOPHEN, IBUPROFEN, CAFFEINE],
  "pain-fever": [ACETAMINOPHEN, IBUPROFEN],
  infection: [AMOXICILLIN],
  neuro: [GABAPENTIN],
  // No PK-backed catalogue row matches these conditions yet. Do not invent
  // one: a medicine without a sourced row cannot be simulated.
  diabetes: [],
  hypertension: [],
  asthma: [],
  liver: [],
  kidney: [],
};

/** A copy so a caller can never mutate the shared table. */
export function suggestionsFor(conditionId: string): SuggestedMedicine[] {
  return [...(SUGGESTED_MEDICINES[conditionId] ?? [])];
}

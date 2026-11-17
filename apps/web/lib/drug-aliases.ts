/**
 * Everyday names for the same ingredient.
 *
 * The catalogue uses the openFDA ingredient name, which is the US name: a
 * visitor typing "paracetamol" (or "frusemide", "salbutamol") is asking for a
 * medicine that *is* in the catalogue, just under another name. These aliases
 * point the search at the canonical term instead of pretending nothing
 * matched.
 *
 * They are names only — no parameters, no claims. A misspelling is not fixed
 * here; only genuinely different names for the same substance.
 */
const ALIASES: Record<string, string> = {
  paracetamol: "acetaminophen",
  acetaminophen: "paracetamol",
  amoxycillin: "amoxicillin",
  frusemide: "furosemide",
  salbutamol: "albuterol",
  albuterol: "salbutamol",
  adrenaline: "epinephrine",
  epinephrine: "adrenaline",
  thyroxine: "levothyroxine",
  levothyroxine: "thyroxine",
  pethidine: "meperidine",
  lignocaine: "lidocaine",
  glycerol: "glycerin",
};

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The other name this term is known by, if any. */
export function aliasFor(term: string): string | null {
  return ALIASES[normalize(term)] ?? null;
}

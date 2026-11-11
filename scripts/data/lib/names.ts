/**
 * Drug name normalisation.
 *
 * The same substance arrives under several names: our engine list said
 * paracetamol, the US labels and the catalogue say acetaminophen, and a
 * display name may carry a synonym in brackets ("Acetaminophen (paracetamol)").
 * Anything that matches names — the catalogue lookup, the label search, the
 * interaction pairs — has to agree on one form first, or a drug ends up
 * looking like two drugs, or like a pair with itself.
 */

/** Salt and formulation words that do not change the substance. */
const SALT_WORDS =
  /\b(sodium|potassium|calcium|magnesium|chloride|bromide|sulfate|sulphate|tartrate|succinate|acetate|citrate|maleate|mesylate|besylate|phosphate|hydrochloride|anhydrous|dihydrate|monohydrate|extended[- ]release)\b/g;

/** Names that are the same substance under a different name. */
const ALIASES: Record<string, string> = {
  paracetamol: 'acetaminophen',
  acetaminophen: 'acetaminophen',
  aspirin: 'aspirin',
  'acetylsalicylic acid': 'aspirin',
  acetylsalicylic: 'aspirin',
};

/** The canonical substance name for a drug name. */
export function canonicalName(name: string): string {
  // "Acetaminophen (paracetamol)" -> "acetaminophen"
  const withoutBracket = name.replace(/\([^)]*\)/g, ' ').trim();
  const lower = withoutBracket.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const plain = lower
    .replace(SALT_WORDS, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[plain] ?? plain;
}

/**
 * The names to search a label index for, best first: the name itself, then
 * the names it is known by.
 */
export function searchNames(name: string): string[] {
  const names: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !names.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      names.push(trimmed);
    }
  };
  push(name);
  const withoutBracket = name.replace(/\([^)]*\)/g, ' ').trim();
  push(withoutBracket);
  const canonical = canonicalName(name);
  push(canonical);
  if (canonical === 'acetaminophen') push('acetaminophen');
  if (canonical === 'aspirin') push('aspirin');
  return names;
}

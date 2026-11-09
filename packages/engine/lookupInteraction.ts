import { InteractionPair } from './types';

export interface InteractionLookupResult {
  found: boolean;
  message: string;
  pair?: InteractionPair;
}

/**
 * Look up a verified interaction pair in either order.
 * Never claim "no interaction" or "safe" when the pair is absent — the
 * absence only means the pair is not in this small, cited data set.
 */
export function lookupInteraction(
  a: string,
  b: string,
  interactions: InteractionPair[]
): InteractionLookupResult {
  const hit = interactions.find(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)
  );
  if (!hit) {
    return { found: false, message: 'Not in our small verified set' };
  }
  return {
    found: true,
    message: `${hit.a} + ${hit.b} (${hit.severity}) — ${hit.mechanism}`,
    pair: hit,
  };
}

/**
 * The catalogue, read straight from the browser.
 *
 * This app deploys as a static site (GitHub Pages), so there is no app
 * server between the browser and the two things it needs to read:
 *
 * - Supabase (the catalogue): read with the anon key. Your RLS policies
 *   already make the catalogue publicly readable and the approved PK rows
 *   public; the browser key is the same one inlined everywhere else.
 * - Nothing here writes. The service key never ships.
 */

import type {
  DrugCatalogHit,
  DrugParameterCitation,
  DrugPkRow,
} from "@dib/data-client";
import { aliasFor } from "./drug-aliases";
import { getDataClient } from "./data-client";

export type CatalogueHit = DrugCatalogHit;

export type CatalogueSearch =
  | { hits: CatalogueHit[]; error: null }
  | { hits: null; error: "unconfigured" | "unreachable" };

export type CatalogueSearchOptions = {
  /**
   * Only medicines that can actually be simulated: the approved row has all
   * four parameters *and* a citation for each. The database computes this as
   * `pk_status = 'reviewed'`; asking for it here keeps the console from
   * offering rows nobody can pick.
   */
  readyOnly?: boolean;
};

/** How many RPC rows to pull when filtering for ready medicines. */
const SCAN_LIMIT = 50;

/** One de-duplicated list, order preserved (the RPC's relevance order). */
function mergeHits(...lists: CatalogueHit[][]): CatalogueHit[] {
  const seen = new Set<string>();
  const out: CatalogueHit[] = [];
  for (const list of lists) {
    for (const hit of list) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push(hit);
    }
  }
  return out;
}

export async function searchCatalogue(
  rawQuery: string,
  limit = 12,
  options: CatalogueSearchOptions = {}
): Promise<CatalogueSearch> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return { hits: [], error: null };
  const c = getDataClient();
  if (!c) return { hits: null, error: "unconfigured" };

  // Filtering happens after the RPC: `search_drugs` has no status argument, so
  // we ask for more rows than we show and keep the ready ones in rank order.
  const ask = options.readyOnly ? SCAN_LIMIT : limit;

  const terms = [q];
  const alias = aliasFor(q);
  if (alias) terms.push(alias);

  const results = await Promise.all(terms.map((term) => c.drugs.searchDrugs(term, ask)));
  if (results.some((r) => r.error || r.data === null)) {
    return { hits: null, error: "unreachable" };
  }

  const merged = mergeHits(...results.map((r) => r.data as CatalogueHit[]));
  const hits = options.readyOnly
    ? merged.filter((hit) => hit.pkStatus === "reviewed").slice(0, limit)
    : merged.slice(0, limit);

  return { hits, error: null };
}

export type ReadyCatalogue = { hits: CatalogueHit[]; error: null } | { hits: null; error: "unconfigured" | "unreachable" };

/**
 * The medicines the console can run right now.
 *
 * Shown before the visitor types anything: the honest answer to "which
 * medicine can I pick?" should not depend on guessing a name that happens to
 * have approved parameters.
 */
export async function listReadyCatalogue(limit = 8): Promise<ReadyCatalogue> {
  const c = getDataClient();
  if (!c) return { hits: null, error: "unconfigured" };
  const { data, error } = await c.drugs.listReadyDrugs(limit);
  if (error || data === null) return { hits: null, error: "unreachable" };
  return { hits: data, error: null };
}

export type CataloguePk = DrugPkRow;

/** The citation behind each value of a drug's parameters. */
export type CatalogueCitation = DrugParameterCitation;

/**
 * The citations for one drug's parameters.
 *
 * The public view only exposes an approved drug's citations, so a drug with no
 * approved row returns an empty list — which is the honest answer: a drug with
 * no approved parameters has nothing to cite.
 */
export async function getApprovedCitations(
  rawId: string
): Promise<CatalogueCitation[] | "error" | "unconfigured"> {
  // The catalogue's ids are the normalized ingredient names, always lowercase;
  // a mixed-case id is the same drug and must not look unapproved.
  const id = rawId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i.test(id)) return "error";
  const c = getDataClient();
  if (!c) return "unconfigured";
  const { data, error } = await c.drugs.getDrugCitations(id);
  if (error) return "error";
  return data ?? [];
}

export async function getApprovedPk(rawId: string): Promise<CataloguePk | null | "error" | "unconfigured"> {
  const id = rawId.trim().toLowerCase();
  // Same exact-id rule the old API route enforced.
  if (!/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i.test(id)) return "error";
  const c = getDataClient();
  if (!c) return "unconfigured";
  const { data, error } = await c.drugs.getDrugPk(id);
  if (error) return "error";
  return data; // null when no approved row exists — that is a normal answer
}

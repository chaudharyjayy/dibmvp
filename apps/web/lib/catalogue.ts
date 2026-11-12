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

import { createDataClient, type DrugCatalogHit, type DrugPkRow } from "@dib/data-client";

export type CatalogueHit = DrugCatalogHit;

let cached: ReturnType<typeof createDataClient> | null | undefined;

/** One shared client — the browser already holds this key for profile/reports. */
function client() {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith("paste-")) {
    cached = null;
    return null;
  }
  try {
    cached = createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
  } catch {
    cached = null;
  }
  return cached;
}

export type CatalogueSearch =
  | { hits: CatalogueHit[]; error: null }
  | { hits: null; error: "unconfigured" | "unreachable" };

export async function searchCatalogue(rawQuery: string, limit = 12): Promise<CatalogueSearch> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return { hits: [], error: null };
  const c = client();
  if (!c) return { hits: null, error: "unconfigured" };
  const { data, error } = await c.drugs.searchDrugs(q, limit);
  if (error || data === null) return { hits: null, error: "unreachable" };
  return { hits: data, error: null };
}

export type CataloguePk = DrugPkRow;

export async function getApprovedPk(rawId: string): Promise<CataloguePk | null | "error" | "unconfigured"> {
  const id = rawId.trim();
  // Same exact-id rule the old API route enforced.
  if (!/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i.test(id)) return "error";
  const c = client();
  if (!c) return "unconfigured";
  const { data, error } = await c.drugs.getDrugPk(id);
  if (error) return "error";
  return data; // null when no approved row exists — that is a normal answer
}

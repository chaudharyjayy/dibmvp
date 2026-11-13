import type { DataBackend } from './backend';
import type { DataClientResult } from './types';
import { mapSupabaseError, wrap } from './errors';

/**
 * The drug catalogue: identity from openFDA, pharmacokinetics only from
 * approved, cited `drug_pk` rows (exposed through the `drug_pk_public`
 * view, which leaves reviewer names and notes on the service side).
 *
 * Everything here is read-only. Values are never invented client-side;
 * a drug without an approved PK row simply has no parameters, and the
 * caller has to say so.
 */

export type DrugCatalogHit = {
  /** The normalized ingredient id, stable across catalogue refreshes. */
  id: string;
  name: string;
  routes: string[];
  pkStatus: 'unsourced' | 'partial' | 'reviewed';
  productCount: number;
};

export type DrugPkRow = {
  drugId: string;
  route: string;
  kaPerH: number | null;
  fBioavailability: number | null;
  clLPerHPerKg: number | null;
  vLPerKg: number | null;
  doseMinMg: number | null;
  doseMaxMg: number | null;
  sourceUrl: string;
  sourceQuote: string;
  sourceTitle: string | null;
};

export type DrugParameterCitation = {
  /** Which parameter the value belongs to, e.g. 'ka_per_h'. */
  parameter: string;
  /** The value as stored. */
  value: number | null;
  sourceUrl: string;
  sourceQuote: string;
  sourceTitle: string | null;
  /** 'label' | 'bookshelf' | 'pkdb' | 'paper' | 'other'. */
  sourceKind: string | null;
  /** Who the value applies to, e.g. 'adults'. */
  population: string | null;
  /** The route the source describes. */
  route: string | null;
};

/**
 * The citation behind each value of an approved drug's parameters.
 *
 * The public view only exposes the citations of approved drugs, so this
 * returns an empty list for a drug that is not approved — which is the honest
 * answer: a drug with no approved row has no parameters to cite.
 */
export async function getDrugCitations(
  drugId: string,
  backend: DataBackend
): Promise<DataClientResult<DrugParameterCitation[]>> {
  return wrap(async () => {
    let res: { data: unknown; error: unknown };
    try {
      res = await backend
        .from('drug_pk_citations')
        .select(
          'parameter,value,source_url,source_quote,source_title,source_kind,population,route'
        )
        .eq('drug_id', drugId);
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    return {
      data: rows.map((row) => ({
        parameter: typeof row.parameter === 'string' ? row.parameter : '',
        value: typeof row.value === 'number' ? row.value : row.value == null ? null : Number(row.value),
        sourceUrl: typeof row.source_url === 'string' ? row.source_url : '',
        sourceQuote: typeof row.source_quote === 'string' ? row.source_quote : '',
        sourceTitle: typeof row.source_title === 'string' ? row.source_title : null,
        sourceKind: typeof row.source_kind === 'string' ? row.source_kind : null,
        population: typeof row.population === 'string' ? row.population : null,
        route: typeof row.route === 'string' ? row.route : null,
      })),
      error: null,
    };
  });
}

/** The search_drugs RPC's row shape, as PostgREST returns it. */
type SearchRow = {
  id: unknown;
  name: unknown;
  routes: unknown;
  pk_status: unknown;
  product_count: unknown;
};

function parseHit(row: SearchRow): DrugCatalogHit | null {
  if (typeof row?.id !== 'string' || typeof row?.name !== 'string') return null;
  return {
    id: row.id,
    name: row.name,
    routes: Array.isArray(row.routes) ? (row.routes as string[]) : [],
    pkStatus:
      row.pk_status === 'reviewed' || row.pk_status === 'partial' ? row.pk_status : 'unsourced',
    productCount: typeof row.product_count === 'number' ? row.product_count : 0,
  };
}

/** Catalogue search backed by the `search_drugs` RPC (trigram, relevance-ordered). */
export async function searchDrugs(
  q: string,
  limit: number,
  backend: DataBackend
): Promise<DataClientResult<DrugCatalogHit[]>> {
  return wrap(async () => {
    let res: { data: unknown; error: unknown };
    try {
      // The rpc hook is optional on the backend interface (mocks omit it).
      if (typeof backend.rpc !== 'function') {
        return { data: null, error: { code: 'backend-no-rpc', message: 'backend has no rpc method' } };
      }
      res = await backend.rpc('search_drugs', { q, lim: limit });
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    const rows = Array.isArray(res.data) ? (res.data as SearchRow[]) : [];
    return { data: rows.map(parseHit).filter((h): h is DrugCatalogHit => h !== null), error: null };
  });
}

/** One drug's approved pharmacokinetics, or null when none is approved. */
export async function getDrugPk(
  drugId: string,
  backend: DataBackend
): Promise<DataClientResult<DrugPkRow | null>> {
  return wrap(async () => {
    let res: { data: unknown; error: unknown };
    try {
      res = await backend
        .from('drug_pk_public')
        .select(
          'drug_id, route, ka_per_h, f_bioavailability, cl_l_per_h_per_kg, v_l_per_kg, dose_min_mg, dose_max_mg, source_url, source_quote, source_title'
        )
        .eq('drug_id', drugId)
        .maybeSingle();
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    if (res.data == null) return { data: null, error: null };
    const row = res.data as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : null);
    return {
      data: {
        drugId: typeof row.drug_id === 'string' ? row.drug_id : drugId,
        route: typeof row.route === 'string' ? row.route : 'oral',
        kaPerH: num(row.ka_per_h),
        fBioavailability: num(row.f_bioavailability),
        clLPerHPerKg: num(row.cl_l_per_h_per_kg),
        vLPerKg: num(row.v_l_per_kg),
        doseMinMg: num(row.dose_min_mg),
        doseMaxMg: num(row.dose_max_mg),
        sourceUrl: typeof row.source_url === 'string' ? row.source_url : '',
        sourceQuote: typeof row.source_quote === 'string' ? row.source_quote : '',
        sourceTitle: typeof row.source_title === 'string' ? row.source_title : null,
      },
      error: null,
    };
  });
}

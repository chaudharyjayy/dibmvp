/**
 * Pure normalisation for the openFDA NDC directory (CC0).
 *
 * Everything here is a fact copied from the feed: names, routes, dosage forms,
 * strengths, product types. Nothing is derived numerically, and no PK parameter
 * is ever produced here — that layer lives in data/pk-review.csv and needs a
 * citation per row (see scripts/data/import-pk.ts).
 *
 * openFDA NDC record reference: https://open.fda.gov/apis/drug/ndc/
 */

export interface NdcIngredient {
  name: string;
  strength: string;
}

export interface NdcProduct {
  product_ndc: string;
  product_id?: string;
  generic_name?: string;
  brand_name?: string;
  labeler_name?: string;
  dosage_form?: string;
  route?: string[];
  product_type?: string;
  marketing_category?: string;
  active_ingredients?: NdcIngredient[];
  spl_id?: string;
}

export interface DrugRow {
  /** The normalized ingredient name — unique by construction and stable across
   *  refreshes, so a reviewed PK row can never drift onto another ingredient. */
  id: string;
  name: string;
  normalized_name: string;
  routes: string[];
  dosage_forms: string[];
  product_types: string[];
  product_count: number;
  combination_product_count: number;
}

export interface ProductRow {
  product_ndc: string;
  product_id: string | null;
  generic_name: string | null;
  brand_name: string | null;
  labeler_name: string | null;
  dosage_form: string | null;
  route: string[];
  product_type: string | null;
  marketing_category: string | null;
  active_ingredients: NdcIngredient[];
  drug_ids: string[];
  spl_id: string | null;
  source_url: string;
}

export interface CatalogStats {
  productsIn: number;
  productsOut: number;
  duplicateProducts: number;
  skippedNoIngredients: number;
  ingredients: number;
  oralIngredients: number;
  combinationProducts: number;
}

const ORAL_ROUTES = new Set(['ORAL', 'ORAL-25', 'ORAL-28']);

function titleCaseAllCaps(value: string): string {
  // Leave a name that already has mixed case alone: it is the source spelling.
  if (/[a-z]/.test(value)) return value;
  return value
    .toLowerCase()
    .replace(/(^|[^a-z0-9])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Display name per ingredient: the product's own generic name is only safe for
 * single-ingredient products; in a combination product it names the whole mix,
 * not this ingredient.
 */
function displayCandidate(
  ingredient: string,
  genericName: string | undefined,
  singleIngredient: boolean
): string {
  const raw = (singleIngredient ? genericName?.trim() : '') || ingredient;
  return titleCaseAllCaps(raw);
}

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function slugify(raw: string): string {
  return normalizeName(raw)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function productSourceUrl(productNdc: string): string {
  const quoted = encodeURIComponent(`"${productNdc}"`);
  return `https://api.fda.gov/drug/ndc.json?search=product_ndc:${quoted}`;
}

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

/**
 * Build the ingredient catalogue and the product rows from NDC records.
 * Deterministic: the same input produces identical output, so imports are
 * idempotent and diffs are reviewable.
 */
export function buildCatalog(products: NdcProduct[]): {
  drugs: DrugRow[];
  products: ProductRow[];
  stats: CatalogStats;
} {
  const seen = new Map<
    string,
    {
      displayNames: Map<string, number>;
      routes: string[];
      forms: string[];
      types: string[];
      productCount: number;
      combinationCount: number;
    }
  >();
  const byNdc = new Map<string, ProductRow>();
  let skipped = 0;
  let duplicates = 0;
  let combinationProducts = 0;

  for (const p of products) {
    const ndc = (p.product_ndc ?? '').trim();
    const ingredients = (p.active_ingredients ?? [])
      .map((a) => ({ name: (a.name ?? '').trim(), strength: (a.strength ?? '').trim() }))
      .filter((a) => a.name.length > 0);

    const normalized = [...new Set(ingredients.map((a) => normalizeName(a.name)))];
    if (!ndc || normalized.length === 0) {
      skipped++;
      continue;
    }
    if (byNdc.has(ndc)) duplicates++;
    if (normalized.length > 1) combinationProducts++;

    const route = (p.route ?? []).map((r) => r.trim().toUpperCase()).filter(Boolean);
    const productType = p.product_type?.trim() || null;

    for (const key of normalized) {
      let entry = seen.get(key);
      if (!entry) {
        entry = {
          displayNames: new Map(),
          routes: [],
          forms: [],
          types: [],
          productCount: 0,
          combinationCount: 0,
        };
        seen.set(key, entry);
      }
      // Use the ingredient's own spelling, never the combination product name.
      const ownName = displayCandidate(
        ingredients.find((a) => normalizeName(a.name) === key)?.name ?? key,
        p.generic_name,
        normalized.length === 1
      );
      entry.displayNames.set(ownName, (entry.displayNames.get(ownName) ?? 0) + 1);
      for (const r of route) pushUnique(entry.routes, r);
      const form = p.dosage_form?.trim();
      if (form) pushUnique(entry.forms, form);
      if (productType) pushUnique(entry.types, productType);
      entry.productCount++;
      if (normalized.length > 1) entry.combinationCount++;
    }

    byNdc.set(ndc, {
      product_ndc: ndc,
      product_id: p.product_id ?? null,
      generic_name: p.generic_name?.trim() || null,
      brand_name: p.brand_name?.trim() || null,
      labeler_name: p.labeler_name?.trim() || null,
      dosage_form: p.dosage_form?.trim() || null,
      route,
      product_type: productType,
      marketing_category: p.marketing_category?.trim() || null,
      active_ingredients: ingredients,
      drug_ids: normalized.sort(),
      spl_id: p.spl_id ?? null,
      source_url: productSourceUrl(ndc),
    });
  }

  const drugs: DrugRow[] = [...seen.keys()].sort().map((key) => {
    const entry = seen.get(key)!;
    // Most frequent exact spelling; ties break alphabetically for determinism.
    const name =
      [...entry.displayNames.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      )[0]?.[0] ?? key;
    return {
      id: key,
      name,
      normalized_name: key,
      routes: entry.routes.sort(),
      dosage_forms: entry.forms.sort(),
      product_types: entry.types.sort(),
      product_count: entry.productCount,
      combination_product_count: entry.combinationCount,
    };
  });

  const productRows = [...byNdc.values()];
  const oral = new Set<string>();
  for (const row of productRows) {
    const isOral =
      row.route.some((r) => ORAL_ROUTES.has(r)) ||
      (row.dosage_form ?? '').toUpperCase().includes('ORAL');
    if (isOral) for (const id of row.drug_ids) oral.add(id);
  }

  return {
    drugs,
    products: productRows,
    stats: {
      productsIn: products.length,
      productsOut: productRows.length,
      duplicateProducts: duplicates,
      skippedNoIngredients: skipped,
      ingredients: drugs.length,
      oralIngredients: oral.size,
      combinationProducts,
    },
  };
}

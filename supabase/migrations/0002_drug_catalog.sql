-- 0002_drug_catalog.sql — real drug catalogue (openFDA NDC, CC0) plus a
-- provenance-gated pharmacokinetic layer.
--
-- Two rules this schema enforces:
--   1. Catalogue facts come from openFDA; each product row keeps a queryable
--      source URL. No value is typed by hand into the catalogue.
--   2. A drug is only simulatable when a `drug_pk` row is `approved` AND
--      carries a source URL, a quoted source, all four parameters, a dose
--      range, a reviewer and a review date. The CHECK constraint rejects
--      anything less, so the guarantee does not depend on a script behaving.
--
-- Rows are written by scripts/data/import-*.ts with the server-only admin key.
-- Everyone else gets read-only access, and drug_pk is exposed only through a
-- view that shows approved rows without reviewer names or notes.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Ingredients (one row per unique ingredient name across all NDC products)
-- ---------------------------------------------------------------------------

create table public.drugs (
  -- The normalized ingredient name. Unique by construction and stable across
  -- refreshes, so a reviewed PK row can never drift onto another ingredient.
  id text primary key,
  name text not null,                        -- display name from openFDA
  normalized_name text not null unique,      -- lowercased, whitespace-collapsed
  routes text[] not null default '{}',       -- ORAL, TOPICAL, INTRAVENOUS, ...
  dosage_forms text[] not null default '{}',
  product_types text[] not null default '{}',-- HUMAN PRESCRIPTION DRUG / HUMAN OTC DRUG
  product_count int not null default 0,      -- NDC products containing it
  combination_product_count int not null default 0,
  pk_status text not null default 'unsourced'
    check (pk_status in ('unsourced', 'partial', 'reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index drugs_name_trgm_idx on public.drugs using gin (normalized_name gin_trgm_ops);
create index drugs_routes_idx on public.drugs using gin (routes);
create index drugs_pk_status_idx on public.drugs (pk_status);

-- ---------------------------------------------------------------------------
-- NDC products (the product-level catalogue: ~138k rows from openFDA)
-- ---------------------------------------------------------------------------

create table public.drug_products (
  product_ndc text primary key,
  product_id text,
  generic_name text,
  brand_name text,
  labeler_name text,
  dosage_form text,
  route text[] not null default '{}',
  product_type text,
  marketing_category text,
  active_ingredients jsonb not null default '[]'::jsonb, -- [{ name, strength }]
  drug_ids text[] not null default '{}',                 -- normalized ingredient ids
  spl_id text,
  source_url text not null,
  updated_at timestamptz not null default now()
);

create index drug_products_drug_ids_idx on public.drug_products using gin (drug_ids);
create index drug_products_ingredients_idx on public.drug_products using gin (active_ingredients jsonb_path_ops);
create index drug_products_brand_trgm_idx on public.drug_products using gin (lower(brand_name) gin_trgm_ops);
create index drug_products_generic_trgm_idx on public.drug_products using gin (lower(generic_name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Pharmacokinetic parameters: one row per drug, provenance required
-- ---------------------------------------------------------------------------

create table public.drug_pk (
  drug_id text primary key references public.drugs (id) on delete cascade,
  route text not null default 'oral',
  ka_per_h numeric check (ka_per_h is null or (ka_per_h > 0 and ka_per_h <= 50)),
  f_bioavailability numeric check (f_bioavailability is null or (f_bioavailability > 0 and f_bioavailability <= 1)),
  cl_l_per_h_per_kg numeric check (cl_l_per_h_per_kg is null or (cl_l_per_h_per_kg > 0 and cl_l_per_h_per_kg <= 10)),
  v_l_per_kg numeric check (v_l_per_kg is null or (v_l_per_kg > 0.01 and v_l_per_kg <= 100)),
  dose_min_mg numeric check (dose_min_mg is null or dose_min_mg > 0),
  dose_max_mg numeric check (dose_max_mg is null or dose_max_mg > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  source_url text not null check (char_length(source_url) >= 12),
  source_quote text not null check (char_length(source_quote) >= 40),
  source_title text,
  reviewer text,
  reviewed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  check (dose_min_mg is null or dose_max_mg is null or dose_min_mg <= dose_max_mg),
  -- An approved row is complete by definition. There is no partial approval.
  check (
    status <> 'approved' or (
      ka_per_h is not null and
      f_bioavailability is not null and
      cl_l_per_h_per_kg is not null and
      v_l_per_kg is not null and
      dose_min_mg is not null and
      dose_max_mg is not null and
      reviewer is not null and
      reviewed_at is not null and
      route = 'oral'
    )
  )
);

create index drug_pk_approved_idx on public.drug_pk (drug_id) where status = 'approved';

-- ---------------------------------------------------------------------------
-- drugs.pk_status is derived, never written by hand
-- ---------------------------------------------------------------------------

create function public.sync_drug_pk_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text := coalesce(new.drug_id, old.drug_id);
begin
  update public.drugs d
  set pk_status = case
    when exists (
      select 1 from public.drug_pk p
      where p.drug_id = d.id
        and p.status = 'approved'
        and p.ka_per_h is not null
        and p.f_bioavailability is not null
        and p.cl_l_per_h_per_kg is not null
        and p.v_l_per_kg is not null
    ) then 'reviewed'
    when exists (select 1 from public.drug_pk p where p.drug_id = d.id) then 'partial'
    else 'unsourced'
  end
  where d.id = target;
  return null;
end;
$$;

revoke all on function public.sync_drug_pk_status() from public, anon, authenticated;

create trigger drug_pk_sync_status
  after insert or update or delete on public.drug_pk
  for each row execute function public.sync_drug_pk_status();

-- Only approved rows, and only the fields the simulator needs. Reviewer names
-- and free-text notes stay in the table, readable by the service role alone.
create view public.drug_pk_public
with (security_invoker = true) as
select
  drug_id,
  route,
  ka_per_h,
  f_bioavailability,
  cl_l_per_h_per_kg,
  v_l_per_kg,
  dose_min_mg,
  dose_max_mg,
  source_url,
  source_quote,
  source_title
from public.drug_pk
where status = 'approved';

-- ---------------------------------------------------------------------------
-- Search: one RPC so the app never downloads the catalogue
-- ---------------------------------------------------------------------------

create function public.search_drugs(q text, lim int default 20)
returns table (
  id text,
  name text,
  routes text[],
  pk_status text,
  product_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with raw as (select lower(trim(coalesce(q, ''))) as s),
  term as (
    select
      raw.s,
      replace(replace(replace(raw.s, '\', '\\'), '%', '\%'), '_', '\_') as escaped
    from raw
  )
  select d.id, d.name, d.routes, d.pk_status, d.product_count
  from public.drugs d, term
  where term.s = ''
     or d.normalized_name like '%' || term.escaped || '%' escape '\'
  order by
    (d.normalized_name = term.s) desc,
    (d.normalized_name like term.escaped || '%' escape '\') desc,
    similarity(d.normalized_name, term.s) desc,
    d.product_count desc,
    d.name asc
  limit least(greatest(coalesce(lim, 20), 1), 50);
$$;

grant execute on function public.search_drugs(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger drugs_touch_updated_at
  before update on public.drugs
  for each row execute function public.touch_updated_at();
create trigger drug_products_touch_updated_at
  before update on public.drug_products
  for each row execute function public.touch_updated_at();
create trigger drug_pk_touch_updated_at
  before update on public.drug_pk
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: public catalogue, read-only; writes are admin-key only
-- ---------------------------------------------------------------------------

alter table public.drugs enable row level security;
alter table public.drug_products enable row level security;
alter table public.drug_pk enable row level security;

create policy "drugs_public_read" on public.drugs
  for select to anon, authenticated using (true);
create policy "drug_products_public_read" on public.drug_products
  for select to anon, authenticated using (true);

-- The PK base table is row-filtered to approved rows AND limited to the columns
-- the public view needs. reviewer and notes are never granted, so `select *`
-- on the table fails and nothing unreviewed can slip out.
create policy "drug_pk_approved_read" on public.drug_pk
  for select to anon, authenticated using (status = 'approved');

revoke all on public.drugs from anon, authenticated;
revoke all on public.drug_products from anon, authenticated;
revoke all on public.drug_pk from anon, authenticated;

grant select on public.drugs to anon, authenticated;
grant select on public.drug_products to anon, authenticated;
grant select (
  drug_id,
  route,
  status,
  ka_per_h,
  f_bioavailability,
  cl_l_per_h_per_kg,
  v_l_per_kg,
  dose_min_mg,
  dose_max_mg,
  source_url,
  source_quote,
  source_title
) on public.drug_pk to anon, authenticated;
grant select on public.drug_pk_public to anon, authenticated;

comment on table public.drugs is
  'Ingredient catalogue from openFDA NDC (CC0). Loaded by scripts/data/import-catalog.ts.';
comment on table public.drug_products is
  'NDC product rows from openFDA NDC (CC0). Each row keeps its source query URL.';
comment on table public.drug_pk is
  'PK parameters. Only status=approved rows are exposed (via drug_pk_public) and only complete approved rows can exist.';
comment on view public.drug_pk_public is
  'Approved PK rows without reviewer/notes. The simulator reads this, never drug_pk directly.';

-- 0003_pk_parameter_provenance.sql — one citation per parameter.
--
-- Why this exists: drug_pk carries one source_url and one source_quote for the
-- whole row, but a row holds four parameters plus a dose range, and those
-- numbers do not come from one document. Acetaminophen's clearance and volume
-- are in a DailyMed label's pharmacokinetic table; its absorption and
-- bioavailability may only be stated in an NCBI Bookshelf monograph. One quote
-- cannot honestly cover both, so the citation moves down to the parameter.
--
-- The rule stays the same and gets stricter: a value may only exist in an
-- approved row if that exact value has its own citation row. The trigger
-- below enforces it in the database, so no script can approve a number
-- without a document behind it.

-- ---------------------------------------------------------------------------
-- One row per parameter per drug, with the document it came from
-- ---------------------------------------------------------------------------

create table public.drug_pk_parameter (
  drug_id text not null references public.drugs (id) on delete cascade,
  parameter text not null check (
    parameter in (
      'ka_per_h',
      'f_bioavailability',
      'cl_l_per_h_per_kg',
      'v_l_per_kg',
      'dose_min_mg',
      'dose_max_mg',
      't_half_h'
    )
  ),
  value numeric,
  -- The citation. Same floor as drug_pk: a URL and a real sentence.
  source_url text not null check (char_length(source_url) >= 12),
  source_quote text not null check (char_length(source_quote) >= 40),
  source_title text,
  -- Which kind of document this is: 'label', 'bookshelf', 'pkdb', ...
  source_kind text check (source_kind in ('label', 'bookshelf', 'pkdb', 'paper', 'other')),
  -- Who the value applies to, and by which route. A value measured in
  -- neonates is not an adult value, and an IV value is not an oral one.
  population text,
  route text,
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (drug_id, parameter)
);

comment on table public.drug_pk_parameter is
  'Per-parameter provenance for drug_pk. An approved drug_pk row must have a matching citation row here for every value it carries.';

-- ---------------------------------------------------------------------------
-- An approved row cannot hold a value that has no citation
-- ---------------------------------------------------------------------------

create function public.drug_pk_requires_cited_parameters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uncited text;
begin
  if new.status <> 'approved' then
    return null;
  end if;

  select string_agg(p.name, ', ' order by p.name)
  into uncited
  from (
    values
      ('ka_per_h', new.ka_per_h),
      ('f_bioavailability', new.f_bioavailability),
      ('cl_l_per_h_per_kg', new.cl_l_per_h_per_kg),
      ('v_l_per_kg', new.v_l_per_kg),
      ('dose_min_mg', new.dose_min_mg),
      ('dose_max_mg', new.dose_max_mg)
  ) as p(name, value)
  where p.value is not null
    and not exists (
      select 1
      from public.drug_pk_parameter c
      where c.drug_id = new.drug_id
        and c.parameter = p.name
        and c.value = p.value
    );

  if uncited is not null then
    raise exception
      'cannot approve %: no citation row with the same value for %',
      new.drug_id, uncited;
  end if;

  return null;
end;
$$;

revoke all on function public.drug_pk_requires_cited_parameters() from public, anon, authenticated;

create trigger drug_pk_cited_parameters
  before insert or update on public.drug_pk
  for each row execute function public.drug_pk_requires_cited_parameters();

-- ---------------------------------------------------------------------------
-- Reading: only an approved drug's citations are public
-- ---------------------------------------------------------------------------

alter table public.drug_pk_parameter enable row level security;

create policy "drug_pk_parameter_approved_read" on public.drug_pk_parameter
  for select to anon, authenticated using (
    exists (
      select 1 from public.drug_pk d
      where d.drug_id = drug_pk_parameter.drug_id
        and d.status = 'approved'
    )
  );

revoke all on public.drug_pk_parameter from anon, authenticated;
grant select on public.drug_pk_parameter to anon, authenticated;

create view public.drug_pk_citations
with (security_invoker = true) as
select
  p.drug_id,
  p.parameter,
  p.value,
  p.source_url,
  p.source_quote,
  p.source_title,
  p.source_kind,
  p.population,
  p.route
from public.drug_pk_parameter p;

comment on view public.drug_pk_citations is
  'The citation behind every value of an approved drug_pk row. Reviewer names and review dates stay on the service side.';

grant select on public.drug_pk_citations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keeping the catalogue's status honest
-- ---------------------------------------------------------------------------

-- The derived status now also accounts for a row that is approved but whose
-- citations were later removed: that is not a reviewed drug any more.
create or replace function public.sync_drug_pk_status()
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
        and not exists (
          select 1
          from (
            values
              ('ka_per_h', p.ka_per_h),
              ('f_bioavailability', p.f_bioavailability),
              ('cl_l_per_h_per_kg', p.cl_l_per_h_per_kg),
              ('v_l_per_kg', p.v_l_per_kg)
          ) as v(name, value)
          where not exists (
            select 1 from public.drug_pk_parameter c
            where c.drug_id = p.drug_id
              and c.parameter = v.name
              and c.value = v.value
          )
        )
    ) then 'reviewed'
    when exists (select 1 from public.drug_pk p where p.drug_id = d.id) then 'partial'
    else 'unsourced'
  end
  where d.id = target;
  return null;
end;
$$;

revoke all on function public.sync_drug_pk_status() from public, anon, authenticated;

drop trigger if exists drug_pk_sync_status on public.drug_pk;
create trigger drug_pk_sync_status
  after insert or update or delete on public.drug_pk
  for each row execute function public.sync_drug_pk_status();

-- A citation removed from an approved drug demotes it again.
create function public.drug_pk_parameter_status_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.drug_pk
  set updated_at = now()
  where drug_id = coalesce(new.drug_id, old.drug_id);
  return null;
end;
$$;

revoke all on function public.drug_pk_parameter_status_sync() from public, anon, authenticated;

create trigger drug_pk_parameter_sync_status
  after insert or update or delete on public.drug_pk_parameter
  for each row execute function public.drug_pk_parameter_status_sync();

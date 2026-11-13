-- 0005_fix_cited_parameters_trigger.sql — the gate was cancelling the writes.
--
-- drug_pk_cited_parameters is a BEFORE INSERT OR UPDATE row trigger. In
-- PL/pgSQL, a BEFORE trigger that returns NULL tells PostgreSQL to skip the
-- operation for that row — the statement succeeds, no error is raised, and the
-- row is simply not written. That is what happened: every insert and update
-- after 0003 was silently discarded, so a newly approved drug never reached
-- the table while the import reported success.
--
-- The fix is to return NEW, which is what a BEFORE row trigger must return
-- to let the row through.

create or replace function public.drug_pk_requires_cited_parameters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uncited text;
begin
  if new.status <> 'approved' then
    return new;
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

  return new;
end;
$$;

revoke all on function public.drug_pk_requires_cited_parameters() from public, anon, authenticated;

drop trigger if exists drug_pk_cited_parameters on public.drug_pk;
create trigger drug_pk_cited_parameters
  before insert or update on public.drug_pk
  for each row execute function public.drug_pk_requires_cited_parameters();

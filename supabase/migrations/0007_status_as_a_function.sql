-- 0007_status_as_a_function.sql — let the status be recomputed from anywhere.
--
-- sync_drug_pk_status was a trigger function, so it could only be called as a
-- trigger. The citation trigger needed to recompute a drug's status without
-- touching drug_pk (0006), and it could not call a trigger function directly.
--
-- The work moves into a plain function, refresh_drug_pk_status(target), and
-- the trigger becomes a thin wrapper.

create or replace function public.refresh_drug_pk_status(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
end;
$$;

revoke all on function public.refresh_drug_pk_status(text) from public, anon, authenticated;

create or replace function public.sync_drug_pk_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_drug_pk_status(coalesce(new.drug_id, old.drug_id));
  return null;
end;
$$;

revoke all on function public.sync_drug_pk_status() from public, anon, authenticated;

create or replace function public.drug_pk_parameter_status_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_drug_pk_status(coalesce(new.drug_id, old.drug_id));
  return null;
end;
$$;

revoke all on function public.drug_pk_parameter_status_sync() from public, anon, authenticated;

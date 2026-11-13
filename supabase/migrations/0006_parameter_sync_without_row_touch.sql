-- 0006_parameter_sync_without_row_touch.sql — stop the parameter trigger
-- from re-validating a row that is mid-update.
--
-- drug_pk_parameter_status_sync updated public.drug_pk.updated_at whenever a
-- citation row changed. That update fired the drug_pk gate, which compares the
-- row's values against the citation rows. During an import the citation rows
-- are written first and the drug_pk row second, so in between the two hold
-- different values — and the gate refused the citation update with
-- "cannot approve X: no citation row with the same value for ...".
--
-- The fix is to recompute the catalogue status directly instead of touching
-- drug_pk. sync_drug_pk_status already checks that an approved drug's values
-- still have their citations, so the status stays correct when a citation is
-- removed or changed, and the drug_pk row is never re-validated against a
-- half-written set of citations.

create or replace function public.drug_pk_parameter_status_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_drug_pk_status();
  return null;
end;
$$;

revoke all on function public.drug_pk_parameter_status_sync() from public, anon, authenticated;

drop trigger if exists drug_pk_parameter_sync_status on public.drug_pk_parameter;
create trigger drug_pk_parameter_sync_status
  after insert or update or delete on public.drug_pk_parameter
  for each row execute function public.drug_pk_parameter_status_sync();

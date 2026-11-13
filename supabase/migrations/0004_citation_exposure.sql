-- 0004_citation_exposure.sql — only an approved drug's citations are public.
--
-- 0003 granted select on drug_pk_parameter to anon and authenticated, which
-- also exposed reviewed_by and reviewed_at — the reviewer names the rest of
-- the schema deliberately keeps on the service side. And the citations view
-- selected every parameter row, including the ones belonging to drugs that
-- are not approved.
--
-- The table is now closed to the public roles and the view does the filtering,
-- joining drug_pk so only an approved drug's citations come out.

revoke all on public.drug_pk_parameter from anon, authenticated;
revoke all on public.drug_pk_parameter from public;

drop policy if exists "drug_pk_parameter_approved_read" on public.drug_pk_parameter;

drop view if exists public.drug_pk_citations;

create view public.drug_pk_citations
with (security_invoker = false) as
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
from public.drug_pk_parameter p
join public.drug_pk d
  on d.drug_id = p.drug_id
 and d.status = 'approved';

grant select on public.drug_pk_citations to anon, authenticated;

comment on view public.drug_pk_citations is
  'The citation behind every value of an approved drug_pk row. Reviewer names and review dates stay on the service side.';

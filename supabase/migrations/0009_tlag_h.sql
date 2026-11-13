-- 0009_tlag_h.sql — absorption lag time (optional, nullable). NOT APPLIED.
--
-- Owner-requested shape: a nullable column. Additive only; no existing row is
-- touched; no RLS policy, grant or view definition is changed by this file.
--
-- Why additive nullable is enough: tlag_h defaults to NULL( == absent == 0 in
-- the engine, "A dose reaches the gut at (dose time + 0)"), so the migration is
-- a no-op until a reviewed row carries a value. The engine constraint
-- (simulate: tlag_h must be a finite number >= 0) is the last line of defence,
-- not the first.
--
-- How the value will flow, in order:
--   1. A source states a lag time with a quote (e.g. PMC9232434: "Absorption
--      lag times were 5.3 min and 6.7 min for acetaminophen and ibuprofen,
--      respectively."). Reviewed and recorded; owner sets approved status.
--   2. The importer writes it into drug_pk.tlag_h as part of an *approved*
--      row, never on its own.
--   3. The public view must also expose it for the UI to read it — that is a
--      SECOND, separate migration (recreate public.drug_pk_public with tlag_h
--      in the column list, same security model as 0002: reviewer and notes
--      never granted). It is deliberately NOT in this file: apply this file
--      first, then decide whether the UI needs it.
--
-- Equivalent alternative for the per-parameter pipeline instead of a column:
--   extend the 0008 CHECK list with 't_lag_h' (`t_lag_h` as a parameter row
--   next to ka_per_h etc., no column at all).
-- That keeps ONE storage place for PK values but loses the direct column the
-- owner asked for. If that is the preferred path, amend this file rather than
-- carrying two half-measures; make ONE choice before anything is applied.

alter table public.drug_pk
  add column if not exists tlag_h numeric null
  constraint drug_pk_tlag_h_nonnegative check (tlag_h is null or tlag_h >= 0);

comment on column public.drug_pk.tlag_h is
  'Absorption lag time in hours, optional. NULL means "not stated by the source / not approved"; the engine treats NULL as 0 (dose reaches the gut at dose time). Set only from an approved, cited source. No dosing advice is implied by this column.';

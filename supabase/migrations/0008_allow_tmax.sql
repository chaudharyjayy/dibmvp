-- 0008_allow_tmax.sql — record the time to peak as a first-class parameter.
--
-- No FDA label states an absorption rate constant for any of the three
-- engine drugs, but several state the time to peak, which is the closest
-- thing a label gives. Recording it as a parameter keeps the derivation of ka
-- (from the absorption half-life) visible next to the number it rests on,
-- instead of leaving ka quoted with nothing behind it.

alter table public.drug_pk_parameter
  drop constraint if exists drug_pk_parameter_parameter_check;

alter table public.drug_pk_parameter
  add constraint drug_pk_parameter_parameter_check
  check (
    parameter in (
      'ka_per_h',
      'f_bioavailability',
      'cl_l_per_h_per_kg',
      'v_l_per_kg',
      'dose_min_mg',
      'dose_max_mg',
      't_half_h',
      't_max_h'
    )
  );

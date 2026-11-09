-- 0001_init.sql — accounts + saved reports (no extra PII is stored; the
-- stored JSON matches exactly what the engine produces and needs).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  age_years int check (age_years between 1 and 120),
  weight_kg numeric check (weight_kg > 0 and weight_kg < 400),
  sex text check (sex in ('female', 'male', 'other')),
  updated_at timestamptz default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  title text check (char_length(title) <= 100),
  profile_snapshot jsonb not null, -- { ageYears, weightKg, sex } at sim time
  drugs jsonb not null,            -- [ { drugId, doseMg, times[] } ]
  metrics jsonb not null,          -- { cmaxMgPerL, tmaxH, timeToClearH }
  warnings jsonb not null default '[]'::jsonb,
  summary text,
  summary_source text check (summary_source in ('ai', 'template')),
  engine_version text not null
);

create index reports_user_created_idx
  on public.reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (no policy allows anonymous access — anon role is also
-- revoked below as belt and braces)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.reports enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete to authenticated
  using (id = auth.uid());

create policy "reports_select_own"
  on public.reports for select to authenticated
  using (user_id = auth.uid());

create policy "reports_insert_own"
  on public.reports for insert to authenticated
  with check (user_id = auth.uid());

create policy "reports_update_own"
  on public.reports for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "reports_delete_own"
  on public.reports for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.profiles from anon;
revoke all on public.reports from anon;

-- ---------------------------------------------------------------------------
-- Sign-up trigger: an empty profiles row for every new auth user
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reports-per-user cap: reject inserts beyond 200 rows per user
-- ---------------------------------------------------------------------------

create function public.enforce_report_cap()
returns trigger
language plpgsql
as $$
declare
  n int;
begin
  select count(*) into n from public.reports where user_id = new.user_id;
  if n >= 200 then
    raise exception 'report cap reached (200 per user)';
  end if;
  return new;
end;
$$;

create trigger enforce_report_cap_trigger
  before insert on public.reports
  for each row execute function public.enforce_report_cap();

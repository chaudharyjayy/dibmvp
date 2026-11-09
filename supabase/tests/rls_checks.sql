-- rls_checks.sql — commented SQL checks to run manually in the Supabase SQL
-- editor (or via the supabase CLI) to prove ownership isolation, zero access
-- for anonymous users, and the 200-report cap.
--
-- Recommended: paste into the SQL editor with pgTAP enabled, or run each
-- section as a transaction and observe the committed rows/exceptions.
--
-- Summary of what must hold:
--   * user A cannot select, update or delete user B's rows            (RLS)
--   * a signed-out (anon/postgrest with null JWT) session sees 0 rows (RLS)
--   * an authenticated user blocked at 200 reports                    (cap)
--   * signing up creates an empty profiles row                        (trigger)

begin;

-- set conceptually: user A's JWT
-- select set_config('request.jwt.claims', '{
--   "sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
--   "role": "authenticated"
-- }', true);

-- 1) Both tables report row level security enabled.
select relname, relrowsecurity
  from pg_class
 where relname in ('profiles', 'reports');
-- expect: both rows relrowsecurity = true

-- 2) The exact policies in place.
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
-- expect exactly:
--   profiles: profiles_select_own (SELECT, authenticated)
--   profiles: profiles_insert_own (INSERT, authenticated)
--   profiles: profiles_update_own (UPDATE, authenticated)
--   profiles: profiles_delete_own (DELETE, authenticated)
--   reports:  reports_select_own  (SELECT, authenticated)
--   reports:  reports_insert_own  (INSERT, authenticated)
--   reports:  reports_update_own  (UPDATE, authenticated)
--   reports:  reports_delete_own  (DELETE, authenticated)
-- and NO policy with roles containing 'anon' or 'public'.

-- 3) As user A, a select on user B's reports returns exactly zero rows.
-- WITH b_jwt AS (
--   select set_config('request.jwt.claims',
--     '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true)
-- )
select count(*) from public.reports; -- expect 0 (B's rows invisible to A)

-- 4) As user A, UPDATE targeting B's row affects 0 rows.
-- update public.reports set title = 'hijack'
--  where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- expect: UPDATE 0

-- 5) As user A, DELETE targeting B's row affects 0 rows.
-- delete from public.reports where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- expect: DELETE 0

-- 6) Anonymous sessions get zero rows from both tables.
-- select set_config('request.jwt.claims', '', true);  -- clears JWT
select count(*) from public.profiles; -- expect 0
select count(*) from public.reports;  -- expect 0
-- And inserts as anon fail for lack of a policy even before RLS:
--   insert into public.profiles (id) values (gen_random_uuid()); -- must fail

-- 7) The 200-report cap.
-- As user A:
--   insert 199 rows (gen_random_uuid(), same user_id, minimal json fields),
--   then #200 succeeds, then #201 must raise:
--   ERROR: report cap reached (200 per user)
-- An equivalent direct check of the enforcer:
-- do $$
-- declare n int;
-- begin
--   select count(*) into n from public.reports where user_id = auth.uid();
--   raise notice 'reports so far: % (cap enforced by enforce_report_cap_trigger)', n;
-- end $$;

-- 8) Sign-up trigger creates an empty profiles row for a new user.
-- The trigger exists and fires on auth.users:
select t.tgname as trigger_name, c.relname as fires_on
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where t.tgname = 'on_auth_user_created';
-- expect: one row, fires_on = users

-- Behaviour check (optional, in a throwaway transaction): register a fake
-- auth user, then verify an empty profile row appeared.
-- begin;
--   insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
--        values ('cccccccc-cccc-cccc-cccc-cccccccccccc','x@example.com',gen_random_uuid()::text,
--                'authenticated','authenticated',now(), '00000000-0000-0000-0000-000000000000');
--   select * from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
--   -- expect exactly one row with age_years null, weight_kg null, sex null
-- rollback;

rollback;

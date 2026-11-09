# Supabase setup — accounts & saved reports

The client layer (`packages/data-client`) only ever uses the **anon key**; there
is no service key anywhere in client code (enforced by `supabase/tests/migration.test.ts`
and `npm run lint:copy`).

## 1. Create the project

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it (e.g. `drug-in-body`), pick a region, set a strong database
   password. Keep the dashboard open for steps below.

## 2. Run the migration

Either:

- **SQL editor**: dashboard → *SQL editor* → paste `supabase/migrations/0001_init.sql`
  → *Run*; or
- **Supabase CLI**:
  ```bash
  supabase link --project-ref <your-project-ref>
  supabase db push
  ```

Verify tables appear under *Table editor*: `profiles`, `reports` (each shows
"RLS enabled").

## 3. Enable the auth providers

Dashboard → *Authentication → Providers*:

- **Google**: enable; add the OAuth client ID/secret from
  https://console.cloud.google.com (Google OAuth consent + credentials).
- **Email**: enable *Email OTP / magic link* ("Sign in with email", one-time
  codes). Disable plain password sign-up if you want OTP-only.

## 4. Set the redirect URLs

Dashboard → *Authentication → URL Configuration*:

- **Site URL**: your deployed app URL (or `http://localhost:5173` while
  developing).
- **Redirect URLs**: add every callback your app will pass as `redirectTo`,
  one per line (e.g. `http://localhost:5173/callback`, `https://your.app/callback`).
- In Google Cloud console, add `https://<ref>.supabase.co/auth/v1/callback` as an
  authorised redirect URI for the OAuth client.

## 5. Copy your keys into `.env`

Dashboard → *Project Settings → API*:

- copy **Project URL** → `SUPABASE_URL`
- copy **anon / public** key → `SUPABASE_ANON_KEY`

```bash
cp .env.example .env   # then paste the two values
```

Never commit `.env`. Never use these values in a backend-only context — the
service key is not part of this repo at all.

## 6. Row Level Security policies that exist after migration

| Table | Policy | Command | Scope |
| --- | --- | --- | --- |
| profiles | profiles_select_own | SELECT | `authenticated`, row `id = auth.uid()` |
| profiles | profiles_insert_own | INSERT | `authenticated`, `with check (id = auth.uid())` |
| profiles | profiles_update_own | UPDATE | `authenticated`, both sides `id = auth.uid()` |
| profiles | profiles_delete_own | DELETE | `authenticated`, `id = auth.uid()` |
| reports | reports_select_own | SELECT | `authenticated`, `user_id = auth.uid()` |
| reports | reports_insert_own | INSERT | `authenticated`, `with check (user_id = auth.uid())` |
| reports | reports_update_own | UPDATE | `authenticated`, both sides `user_id = auth.uid()` |
| reports | reports_delete_own | DELETE | `authenticated`, `user_id = auth.uid()` |

No policy exists for `anon`; both tables additionally `REVOKE ALL ... FROM anon`.
A `before insert` trigger triggers `enforce_report_cap`, rejecting rows beyond
200 per user; an `after insert` trigger on `auth.users` creates an empty
profiles row at signup.

### How to verify (manual, SQL editor)

`supabase/tests/rls_checks.sql` is a commented, step-by-step script: run its
segments in order (each `begin; … rollback;`) and observe the expected output —
user B's rows invisible to user A, `UPDATE 0` / `DELETE 0` cross-user, zero rows
when the JWT is cleared (anonymous), exactly ≤ 200 inserts before the cap
raises `report cap reached (200 per user)`, and a fresh signup profile row.

The `reports` and `profiles` tables are matched by policies on `auth.uid()`;
there are no permissive policies for `anon`, so an unsigned session gets an
empty result set on every table — check #6 in the file proves it.

## 8. Manual RLS test checklist (run after signup works)

Working in the app (or temporarily through the client package):

1. `sign up / email-OTP` as **Test User A**; confirm an empty `profiles` row was
   created for them (Table editor → profiles).
2. As A, `[saveReport]` one report; confirm it appears in Table editor →
   reports with A's `user_id`.
3. `sign out`, then `sign up / OTP` as **Test User B** (different email);
   confirm B's profile row exists.
4. As B, save one report; confirm it owns exactly its own row.
5. **Cross-read**: as B, `listReports()` and `getReport('<A-report-id>')` —
   B must see only B's report; A's id must return `not-found` / be absent.
6. **Cross-update / cross-delete**: decode B's JWT, call the REST API with
   B's bearer token targeting A's `user_id` — expect `UPDATE 0` / `DELETE 0` and
   the row untouched.
7. **Anonymous**: clear the browser session and fetch
   `${SUPABASE_URL}/rest/v1/reports` with the anon key — you must get
   `[]` with no error, and a POST must be rejected (RLS + no anon policy).
8. **200-report cap**: as a test user, mass-insert to 200
   reports; the 201st insert must fail with
   `report cap reached (200 per user)`.
9. Clean the test data: `deleteAllMyData()` per user, or targeted deletes from
   the SQL editor (auth user deletion stays admin-side only, see §7).

## 9. Passing the redirect URL to auth helpers

`client.reports.deleteAllMyData()` is fully usable only when signed in;
`signInWithGoogle(redirectTo)` and `signInWithEmailOtp(email)` use Supabase's
default redirect logic, so the `redirectTo` you pass must be whitelisted in
the dashboard first (URL Configuration below) — otherwise the provider will
block the redirect.

#### Dashboard: Authentication → URL Configuration

- **Site URL (local dev)**: `http://localhost:3000`
- **Site URL (production when deployed)**: `<your-vercel-url-here>`
- **Redirect URLs** (add each, one per line):
  - `http://localhost:3000/**`
  - `https://<your-vercel-url-here>/**`

#### Dashboard: Authentication → Providers

- **Email**: enable *Sign in with email*; turn on **Email OTP / magic link**
  ("Confirm email" and OTA codes). Disable plain password sign-up if you want
  a code-based flow only.
- **Google**: enable and paste the OAuth client ID/secret
  (https://console.cloud.google.com), then add
  `https://<ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.

## 10. Deleting the auth user itself (server-side only)

`packages/data-client`'s `deleteAllMyData()` removes the user's reports and
profile row, but the **auth user** record itself can only be removed with
privileged access — never from client code:

```ts
// server-side only (edge function, admin script), [service-key]-protected:
const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
```

```sql
-- or in the SQL editor with owner permissions:
delete from auth.users where id = '<user-id>';  -- cascades to reports/profiles
```

Google sign-in also benefits from revoking the OAuth consent — do it in the
Google account security page if you want the grant removed as well.

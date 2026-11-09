# @dib/data-client

Framework-free auth + data layer for accounts and saved reports (supabase-js
v2). No UI, no styling — plug it into any frontend. Nothing in this package
reads `process.env`; the caller supplies `SUPABASE_URL` and
`SUPABASE_ANON_KEY`.

## Usage

```ts
import { createDataClient } from '@dib/data-client';

const client = createDataClient({
  supabaseUrl: '<your project url>',
  supabaseAnonKey: '<your anon key>',
});

await client.auth.signInWithGoogle('https://your.app/callback');
await client.auth.signInWithEmailOtp('user@example.com');

const { data: profile, error } = await client.profile.getProfile();
await client.profile.saveProfile({ ageYears: 30, weightKg: 70, sex: 'other' });

await client.reports.saveReport({
  title: 'Morning run',
  profileSnapshot: { ageYears: 30, weightKg: 70, sex: 'other' },
  drugs: [{ drugId: 'caffeine', doseMg: 100, times: [0, 6] }],
  metrics: { cmaxMgPerL: 2.1, tmaxH: 1.2, timeToClearH: 10.5 },
  warnings: [],
  summary: null,
  summarySource: 'template',
  engineVersion: '0.1.0',
});

const { data: list } = await client.reports.listReports({ limit: 20 });
await client.reports.deleteReport('<id>');
await client.reports.deleteAllMyData();
```

Every helper returns `{ data, error }` — never a thrown raw SDK error.
All inputs pass zod validation first (strict objects, no unknown fields,
free text max 100 chars, dose/time arrays bounded).

## Privacy rules baked in

- anon key only — the package explicitly rejects a service-role key and
  `npm run lint:copy` fails the build if one is referenced anywhere in
  `packages/` or `apps/`.
- Nothing is logged from profile or report contents.
- `deleteAllMyData()` removes the user's reports and profile row. Deleting the
  **auth user** itself must happen server-side (supabase-js admin API
  `auth.admin.deleteUser(userId)` with the service key, or
  `delete from auth.users where id = …` in the SQL editor) — it can never be
  done from client code, by design.
- Report JSON stores only engine outputs: numbers, ids and times — no names,
  no free-text medical notes, no photos.

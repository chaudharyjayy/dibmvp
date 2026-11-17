/**
 * The one Supabase client for the browser.
 *
 * Every caller shares it: catalogue reads, sign-in, profile. Two clients on
 * the same storage key is what supabase-js warns about ("Multiple GoTrueClient
 * instances"), and the warning is right — session reads can race.
 *
 * The values are public by design (`NEXT_PUBLIC_*`), but they are still read
 * from the environment rather than committed. A missing project is a normal
 * state: callers get null and show their own "not configured" surface.
 */

import { createDataClient, type DataClient } from "@dib/data-client";

let cached: DataClient | null | undefined;

export function getDataClient(): DataClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // `paste-…` is the placeholder in `.env.example`; treat it as absent.
  if (!url || !key || key.startsWith("paste-")) {
    cached = null;
    return null;
  }

  try {
    cached = createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
  } catch {
    cached = null;
  }
  return cached;
}

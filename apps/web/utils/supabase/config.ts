/**
 * Public (anon-key) Supabase configuration, read once per call site.
 *
 * The values live in `apps/web/.env.local`, which is gitignored — a fresh
 * clone has no Supabase project, and that is a normal state, not a crash.
 * Everything that touches Supabase asks this function first and degrades to
 * the app's own "unconfigured" surface when it returns null.
 *
 * Only `NEXT_PUBLIC_*` values are read here: they are inlined into the
 * browser bundle, so nothing privileged may ever be referenced from this file.
 */

export type SupabaseConfig = { url: string; anonKey: string };

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  // `paste-…` is the placeholder in `.env.example`; treat it as absent.
  if (!url || !anonKey || anonKey.startsWith("paste-")) return null;

  return { url, anonKey };
}

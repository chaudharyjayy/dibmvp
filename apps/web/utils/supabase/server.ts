import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

/**
 * Server-side Supabase client, or null when the project is not configured.
 *
 * Callers must handle null (see `app/todos/page.tsx`) — a missing `.env.local`
 * is a setup state, not a runtime error.
 */
export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
};

import type { DataBackend } from './backend';
import type { AuthEvent, DataClientResult, SessionInfo, UnsubscribeFn } from './types';
import { makeError, mapSupabaseError, wrap } from './errors';
import { z } from 'zod';

const RedirectUrlSchema = z.string().trim().url().refine(
  (u) => {
    try {
      return new URL(u).protocol === 'https:' || new URL(u).protocol === 'http:';
    } catch {
      return false;
    }
  },
  { message: 'redirectTo must be an http(s) URL' }
);

export async function getSession(backend: DataBackend): Promise<DataClientResult<{ session: SessionInfo }>> {
  return wrap(async () => {
    const { data, error } = await backend.auth.getSession();
    if (error) return { data: null, error: mapSupabaseError(error) };
    const user = data?.session?.user ?? null;
    return {
      data: {
        session: {
          userId: user?.id ?? null,
          email: user?.email ?? null,
        },
      },
      error: null,
    };
  });
}

export async function signInWithGoogle(redirectTo: string, backend: DataBackend): Promise<DataClientResult<{ provider: 'google' }>> {
  return wrap(async () => {
    const parsed = RedirectUrlSchema.safeParse(redirectTo);
    if (!parsed.success) {
      return { data: null, error: makeError('validation', `redirectTo: must be an http(s) URL`) };
    }
    const { data, error } = await backend.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: parsed.data },
    });
    if (error) return { data: null, error: mapSupabaseError(error) };
    return { data: { provider: (data?.provider ?? 'google') as 'google' }, error: null };
  });
}

const EmailSchema = z.string().trim().email().max(100);

export async function signInWithEmailOtp(email: string, backend: DataBackend): Promise<DataClientResult<{ sent: boolean }>> {
  return wrap(async () => {
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      return { data: null, error: makeError('validation', 'email: must be a valid email of at most 100 characters') };
    }
    const { data, error } = await backend.auth.signInWithOtp({ email: parsed.data });
    if (error) return { data: null, error: mapSupabaseError(error) };
    return { data: { sent: data != null }, error: null };
  });
}

export async function signOut(backend: DataBackend): Promise<DataClientResult<Record<string, never>>> {
  return wrap(async () => {
    const { error } = await backend.auth.signOut();
    if (error) return { data: null, error: mapSupabaseError(error) };
    return { data: {}, error: null };
  });
}

export function onAuthChange(
  callback: (event: AuthEvent, session: SessionInfo) => void,
  backend: DataBackend
): DataClientResult<{ unsubscribe: UnsubscribeFn }> {
  try {
    if (typeof callback !== 'function') {
      return { data: null, error: makeError('validation', 'callback must be a function') };
    }
    const { data, error } = backend.auth.onAuthStateChange((event: AuthEvent, session: any) => {
      const user = session?.user ?? null;
      callback(event, { userId: user?.id ?? null, email: user?.email ?? null });
    });
    if (error != null) {
      return { data: null, error: mapSupabaseError(error) };
    }
    const unsubscribe: UnsubscribeFn = () => data?.subscription?.unsubscribe?.();
    return { data: { unsubscribe }, error: null };
  } catch (e) {
    return { data: null, error: mapSupabaseError(e) };
  }
}

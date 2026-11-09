import { z } from 'zod';
import { DataClientError, DataClientResult } from './types';

export function makeError(code: string, message: string): DataClientError {
  return { code, message };
}

export function mapSupabaseError(err: unknown): DataClientError {
  const e = err as { code?: string; message?: string; name?: string } | null;
  return {
    code: e?.code ?? e?.name ?? 'supabase-error',
    message: e?.message ?? 'unknown supabase error',
  };
}

export function zodToError(err: z.ZodError): DataClientError {
  const issues = err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { code: 'validation', message: issues || 'validation failed' };
}

export function wrap<T>(fn: () => Promise<DataClientResult<T>>): Promise<DataClientResult<T>> {
  return fn().catch((e: unknown): DataClientResult<T> => {
    if (typeof (e as { message?: string })?.message === 'string') {
      const zodErr = e as z.ZodError;
      if (zodErr?.issues && Array.isArray(zodErr.issues)) {
        return { data: null, error: zodToError(zodErr) };
      }
      return { data: null, error: mapSupabaseError(e) };
    }
    return { data: null, error: makeError('runtime', String(e ?? 'unknown error')) };
  });
}

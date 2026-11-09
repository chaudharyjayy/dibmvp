import type { DataBackend } from './backend';
import type { DataClientResult, ProfilePayload } from './types';
import { mapSupabaseError, wrap, zodToError } from './errors';
import { ProfilePayloadSchema, ProfileRowSchema } from './schema';
import { z } from 'zod';

export async function getAuthUserId(backend: DataBackend): Promise<string | null> {
  try {
    const { data, error } = await backend.auth.getSession();
    if (error || !data?.session?.user?.id) return null;
    return data.session.user.id;
  } catch {
    return null;
  }
}

/** Only reads the user's own row (RLS also enforces this server-side). */
export async function getProfile(backend: DataBackend): Promise<DataClientResult<ProfilePayload>> {
  return wrap(async () => {
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: { code: 'not-signed-in', message: 'no signed-in session' } };
    let res: { data: unknown; error: unknown };
    try {
      res = await backend.from('profiles').select('age_years, weight_kg, sex').eq('id', uid).maybeSingle();
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    if (res.data == null) return { data: null, error: null };
    const parsed = ProfileRowSchema.safeParse(res.data);
    if (!parsed.success) {
      return { data: null, error: zodToError(parsed.error as z.ZodError) };
    }
    const row = parsed.data;
    return { data: { ageYears: row.age_years, weightKg: Number(row.weight_kg), sex: row.sex }, error: null };
  });
}

/** Upserts into the row the RLS policies tie to auth.uid(). */
export async function saveProfile(profile: ProfilePayload, backend: DataBackend): Promise<DataClientResult<ProfilePayload>> {
  return wrap(async () => {
    const parsed = ProfilePayloadSchema.safeParse(profile);
    if (!parsed.success) {
      return { data: null, error: zodToError(parsed.error as z.ZodError) };
    }
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: { code: 'not-signed-in', message: 'no signed-in session' } };
    let res: { data: unknown; error: unknown };
    try {
      res = await backend
        .from('profiles')
        .upsert({ id: uid, age_years: parsed.data.ageYears, weight_kg: parsed.data.weightKg, sex: parsed.data.sex })
        .select('age_years, weight_kg, sex')
        .single();
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    const row = ProfileRowSchema.safeParse(res.data);
    if (!row.success) {
      return { data: null, error: zodToError(row.error as z.ZodError) };
    }
    return {
      data: { ageYears: row.data.age_years, weightKg: Number(row.data.weight_kg), sex: row.data.sex },
      error: null,
    };
  });
}

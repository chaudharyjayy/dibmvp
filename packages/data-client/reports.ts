import type { DataBackend } from './backend';
import type {
  DataClientResult,
  DeleteAllResult,
  ListReportsArgs,
  ProfilePayload,
  ReportInput,
  SavedReport,
} from './types';
import { mapSupabaseError, wrap, zodToError } from './errors';
import { ListReportsArgsSchema, ReportInputSchema, ReportIdSchema, ReportRowSchema } from './schema';
import { getAuthUserId } from './profile';
import { z } from 'zod';

const NOT_SIGNED_IN = { code: 'not-signed-in', message: 'no signed-in session' } as const;

export async function saveReport(report: ReportInput, backend: DataBackend): Promise<DataClientResult<SavedReport>> {
  return wrap(async () => {
    const parsed = ReportInputSchema.safeParse(report);
    if (!parsed.success) {
      return { data: null, error: zodToError(parsed.error as z.ZodError) };
    }
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: NOT_SIGNED_IN };

    const r = parsed.data;
    const row = {
      user_id: uid,
      title: r.title,
      profile_snapshot: r.profileSnapshot,
      drugs: r.drugs,
      metrics: r.metrics,
      warnings: r.warnings,
      summary: r.summary,
      summary_source: r.summarySource,
      engine_version: r.engineVersion,
    };
    let res: { data: unknown; error: unknown };
    try {
      res = await backend.from('reports').insert(row).select('id, created_at, user_id, title, profile_snapshot, drugs, metrics, warnings, summary, summary_source, engine_version').single();
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    return mapSavedReport(res.data, uid);
  });
}

function mapSavedReport(raw: unknown, uid: string): DataClientResult<SavedReport> {
  const parsed = ReportRowSchema.safeParse(raw);
  if (!parsed.success) {
    return { data: null, error: zodToError(parsed.error as z.ZodError) };
  }
  const row = parsed.data;
  if (row.user_id !== uid) {
    return { data: null, error: { code: 'security', message: 'returned row does not belong to the signed-in user' } };
  }
  return {
    data: {
      id: row.id,
      createdAt: row.created_at,
      title: row.title,
      profileSnapshot: {
        ageYears: row.profile_snapshot.ageYears,
        weightKg: Number(row.profile_snapshot.weightKg),
        sex: row.profile_snapshot.sex,
      } as ProfilePayload,
      drugs: row.drugs,
      metrics: row.metrics,
      warnings: row.warnings,
      summary: row.summary,
      summarySource: row.summary_source,
      engineVersion: row.engine_version,
    },
    error: null,
  };
}

/** Newest first (user_id, created_at desc) — RLS also restricts to own rows. */
export async function listReports(args: ListReportsArgs, backend: DataBackend): Promise<DataClientResult<SavedReport[]>> {
  return wrap(async () => {
    const parsed = ListReportsArgsSchema.safeParse(args ?? {});
    if (!parsed.success) return { data: null, error: zodToError(parsed.error as z.ZodError) };
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: NOT_SIGNED_IN };
    const { limit, before } = parsed.data;

    let res: { data: unknown; error: unknown };
    try {
      let q = backend
        .from('reports')
        .select('id, created_at, user_id, title, profile_snapshot, drugs, metrics, warnings, summary, summary_source, engine_version')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (before) q = q.lt('created_at', before);
      res = await q;
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    const rows = res.data as unknown[];
    const saved: SavedReport[] = [];
    for (const raw of rows) {
      const mapped = mapSavedReport(raw, uid);
      if (mapped.error) return { data: null, error: mapped.error };
      saved.push(mapped.data!);
    }
    return { data: saved, error: null };
  });
}

export async function getReport(id: string, backend: DataBackend): Promise<DataClientResult<SavedReport>> {
  return wrap(async () => {
    const parsedId = ReportIdSchema.safeParse(id);
    if (!parsedId.success) return { data: null, error: { code: 'validation', message: 'id: must be a uuid' } };
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: NOT_SIGNED_IN };
    let res: { data: unknown; error: unknown };
    try {
      res = await backend.from('reports').select('id, created_at, user_id, title, profile_snapshot, drugs, metrics, warnings, summary, summary_source, engine_version').eq('id', parsedId.data).eq('user_id', uid).maybeSingle();
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    if (res.data == null) return { data: null, error: { code: 'not-found', message: 'report not found' } };
    return mapSavedReport(res.data, uid);
  });
}

export async function deleteReport(id: string, backend: DataBackend): Promise<DataClientResult<{ deleted: true }>> {
  return wrap(async () => {
    const parsedId = ReportIdSchema.safeParse(id);
    if (!parsedId.success) return { data: null, error: { code: 'validation', message: 'id: must be a uuid' } };
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: NOT_SIGNED_IN };
    let res: { data: unknown; error: unknown };
    try {
      res = await backend.from('reports').delete().eq('id', parsedId.data).eq('user_id', uid);
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (res.error) return { data: null, error: mapSupabaseError(res.error) };
    return { data: { deleted: true }, error: null };
  });
}

/**
 * Deletes the user's reports and their profile row. Reports are deleted first
 * (ON DELETE from auth.users would cascade, but we do it explicitly so the
 * count is known).
 */
export async function deleteAllMyData(backend: DataBackend): Promise<DataClientResult<DeleteAllResult>> {
  return wrap(async () => {
    const uid = await getAuthUserId(backend);
    if (!uid) return { data: null, error: NOT_SIGNED_IN };

    let reportsRes: { data: unknown; error: unknown };
    try {
      reportsRes = await backend.from('reports').delete().eq('user_id', uid).select('id');
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (reportsRes.error) return { data: null, error: mapSupabaseError(reportsRes.error) };
    const reportsDeleted = Array.isArray(reportsRes.data) ? reportsRes.data.length : 0;

    let profileRes: { data: unknown; error: unknown };
    try {
      profileRes = await backend.from('profiles').delete().eq('id', uid).select('id');
    } catch (e) {
      return { data: null, error: mapSupabaseError(e) };
    }
    if (profileRes.error) return { data: null, error: mapSupabaseError(profileRes.error) };

    const rlsTriggerRestoresProfile = false; // the signup trigger fires only on new auth users
    const profileDeleted = Array.isArray(profileRes.data) ? profileRes.data.length > 0 : profileRes.data != null;
    void rlsTriggerRestoresProfile;

    return { data: { reportsDeleted, profileDeleted }, error: null };
  });
}

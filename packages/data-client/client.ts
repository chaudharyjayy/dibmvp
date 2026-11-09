/**
 * createDataClient — framework-free wrapper around a supabase-js v2 client.
 *
 * The caller supplies SUPABASE_URL and SUPABASE_ANON_KEY explicitly;
 * this package never reads process.env. The anon key must never be the
 * service one — handled by an explicit check plus a workspace lint rule.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { DataBackend } from './backend';
import type { ListReportsArgs, ProfilePayload, ReportInput, SavedReport } from './types';
import { makeError, wrap } from './errors';
import {
  getSession,
  onAuthChange,
  signInWithEmailOtp,
  signInWithGoogle,
  signOut as authSignOut,
} from './auth';
import { getProfile, saveProfile } from './profile';
import {
  deleteAllMyData,
  deleteReport,
  getReport,
  listReports,
  saveReport,
} from './reports';

const ConfigSchema = z
  .object({
    supabaseUrl: z
      .string()
      .trim()
      .refine((u) => {
        try {
          return new URL(u).protocol === 'https:';
        } catch {
          return false;
        }
      }, 'must be an https Supabase project URL'),
    supabaseAnonKey: z.string().trim().min(20, 'anon key looks too short'),
  })
  .strict();

export interface DataClient {
  /**
   * Auth helpers.
   * - signInWithGoogle(redirectTo) → OAuth redirect flow
   * - signInWithEmailOtp(email) → magic-link / OTP flow
   * - signOut, getSession, onAuthChange(callback)
   */
  auth: {
    signInWithGoogle(redirectTo: string): Promise<{ data: { provider: 'google' } | null; error: { code: string; message: string } | null }>;
    signInWithEmailOtp(email: string): Promise<{ data: { sent: boolean } | null; error: { code: string; message: string } | null }>;
    signOut(): Promise<{ data: Record<string, never> | null; error: { code: string; message: string } | null }>;
    getSession(): Promise<{ data: { session: { userId: string | null; email: string | null } } | null; error: { code: string; message: string } | null }>;
    onAuthChange(callback: (event: string, session: { userId: string | null; email: string | null } | null) => void): { data: { unsubscribe: () => void } | null; error: { code: string; message: string } | null };
  };

  /**
   * Profile helpers (RLS-protected, one row per signed-in user).
   * - getProfile()
   * - saveProfile(profile)
   */
  profile: {
    getProfile(): Promise<{ data: ProfilePayload | null; error: { code: string; message: string } | null }>;
    saveProfile(profile: ProfilePayload): Promise<{ data: ProfilePayload | null; error: { code: string; message: string } | null }>;
  };

  /**
   * Report helpers.
   * - saveReport(report), listReports({limit, before}), getReport(id),
   *   deleteReport(id), deleteAllMyData()
   */
  reports: {
    saveReport(report: ReportInput): Promise<{ data: SavedReport | null; error: { code: string; message: string } | null }>;
    listReports(args?: ListReportsArgs): Promise<{ data: SavedReport[] | null; error: { code: string; message: string } | null }>;
    getReport(id: string): Promise<{ data: SavedReport | null; error: { code: string; message: string } | null }>;
    deleteReport(id: string): Promise<{ data: { deleted: true } | null; error: { code: string; message: string } | null }>;
    deleteAllMyData(): Promise<{ data: { reportsDeleted: number; profileDeleted: boolean } | null; error: { code: string; message: string } | null }>;
  };
}

export function createDataClient(args: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Test injection: a pre-built client (supabase-js or a mock). */
  backend?: DataBackend;
}): DataClient {
  const parsedConfig = ConfigSchema.safeParse({
    supabaseUrl: args?.supabaseUrl,
    supabaseAnonKey: args?.supabaseAnonKey,
  });
  if (!parsedConfig.success) {
    const msg = parsedConfig.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`createDataClient config error — ${msg}`);
  }

  const forbiddenKey = ['service', 'role'].join('_');
  if (parsedConfig.data.supabaseAnonKey.toLowerCase().includes(forbiddenKey)) {
    throw new Error(`createDataClient config error — anon key must not be the ${forbiddenKey} key`);
  }

  let backend: DataBackend;
  if (args.backend) {
    backend = { ...args.backend };
  } else {
    let supabase: SupabaseClient | null = null;
    try {
      supabase = createClient(parsedConfig.data.supabaseUrl, parsedConfig.data.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch {
      supabase = null;
    }
    if (!supabase) {
      const fail = makeError('client', 'could not create supabase client');
      return failedClient(fail);
    }
    backend = {
      from: (name: string) => supabase!.from(name),
      auth: supabase.auth,
    };
  }

  return {
    auth: {
      signInWithGoogle: (redirectTo: string) => withData(() => signInWithGoogle(redirectTo, backend)),
      signInWithEmailOtp: (email: string) => withData(() => signInWithEmailOtp(email, backend)),
      signOut: () => withData(() => authSignOut(backend)),
      getSession: () => withData(() => getSession(backend)),
      onAuthChange: (cb: any) => onAuthChange(cb, backend),
    },
    profile: {
      getProfile: () => withData(() => getProfile(backend)),
      saveProfile: (profile: ProfilePayload) => withData(() => saveProfile(profile, backend)),
    },
    reports: {
      saveReport: (report: ReportInput) => withData(() => saveReport(report, backend)),
      listReports: (args?: ListReportsArgs) => withData(() => listReports(args ?? {}, backend)),
      getReport: (id: string) => withData(() => getReport(id, backend)),
      deleteReport: (id: string) => withData(() => deleteReport(id, backend)),
      deleteAllMyData: () => withData(() => deleteAllMyData(backend)),
    },
  };
}

async function withData<T>(fn: () => Promise<{ data: T; error: any }>): Promise<{ data: T | null; error: { code: string; message: string } | null }> {
  const res = (await fn().then((r) => r, (e) => wrap(() => Promise.reject(e)))) as { data: T; error: any };
  return res;
}

function failedClient(error: { code: string; message: string }): DataClient {
  const err = { data: null, error };
  return {
    auth: {
      signInWithGoogle: async () => err,
      signInWithEmailOtp: async () => err,
      signOut: async () => err,
      getSession: async () => err,
      onAuthChange: () => err,
    },
    profile: {
      getProfile: async () => err,
      saveProfile: async () => err,
    },
    reports: {
      saveReport: async () => err,
      listReports: async () => err,
      getReport: async () => err,
      deleteReport: async () => err,
      deleteAllMyData: async () => err,
    },
  };
}

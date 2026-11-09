import { describe, it, expect } from 'vitest';
import type { DataBackend } from '../backend';
import {
  deleteAllMyData,
  deleteReport,
  getProfile,
  getReport,
  getSession,
  listReports,
  onAuthChange,
  saveProfile,
  saveReport,
  signInWithEmailOtp,
  signInWithGoogle,
  signOut,
} from '../helpers-facade';

type Call = { table: string; op: string; values?: unknown; chain: string[] };
type Resolver = (table: string, op: string) => { data: unknown; error: unknown } | null;

const uid = '7f1dd9b7-38af-4e12-95db-1b69d0a9c69a';

class FakeBuilder {
  /** Pushes land on call.chain so fixture assertions can read them. */
  get chain(): string[] {
    return this.call.chain;
  }
  constructor(public call: Call, private resolver: Resolver) {}
  resultAt(): { data: unknown; error: unknown } {
    return (this.resolver(this.call.table, this.call.op) ?? { data: null, error: null }) as { data: unknown; error: unknown };
  }
  select(_cols = '*') { this.chain.push('select'); return this; }
  insert(values: unknown) { this.call.op = 'insert'; this.call.values = values; return this; }
  upsert(values: unknown) { this.call.op = 'upsert'; this.call.values = values; return this; }
  delete() { this.call.op = 'delete'; return this; }
  eq(col: string, val: unknown) { this.chain.push(`eq:${col}=${String(val)}`); return this; }
  lt(col: string, val: unknown) { this.chain.push(`lt:${col}=${String(val)}`); return this; }
  order(col: string, opts?: Record<string, unknown>) { this.chain.push(`order:${col}:${JSON.stringify(opts ?? {})}`); return this; }
  limit(n: number) { this.chain.push(`limit:${n}`); return this; }
  maybeSingle() { this.chain.push('maybeSingle'); return this; }
  single() { this.chain.push('single'); return this; }
  then<T>(res?: (v: unknown) => T, rej?: (e: unknown) => T): Promise<T> {
    const { data, error } = this.resultAt();
    return Promise.resolve({ data, error } as unknown as T).then(res as never, rej as never);
  }
}

interface Fixture {
  backend: DataBackend;
  calls: Call[];
  authCalls: string[];
  authError?: unknown;
}

function makeBackend(opts: {
  session?: { user?: { id?: string; email?: string } | null } | null;
  resolver?: Resolver;
  authError?: unknown;
}): Fixture {
  const calls: Call[] = [];
  const authCalls: string[] = [];
  const builder = makeBackendBuilder(opts.resolver, calls);
  const backend: DataBackend = {
    from(table: string) {
      return builder(table);
    },
    auth: {
      async signInWithOAuth(args: any) {
        authCalls.push(`signOAuth:${args.provider}:${args?.options?.redirectTo}`);
        if (opts.authError) return { data: null, error: opts.authError };
        return { data: { provider: args.provider, url: `https://x/${args.provider}` }, error: null };
      },
      async signInWithOtp(args: any) {
        authCalls.push(`signOtp:${args.email}`);
        if (opts.authError) return { data: null, error: opts.authError };
        return { data: { user: null, session: null }, error: null };
      },
      async signOut() {
        authCalls.push('signOut');
        return { error: opts.authError ?? null };
      },
      async getSession() {
        authCalls.push('getSession');
        if (opts.authError) return { data: { session: null }, error: opts.authError };
        return { data: { session: opts.session ?? null }, error: null };
      },
      onAuthStateChange(cb: any) {
        authCalls.push('onAuthStateChange');
        if (opts.authError) return { data: null, error: opts.authError };
        cb('SIGNED_IN', opts.session);
        return { data: { subscription: { unsubscribe() { authCalls.push('unsubscribe'); } } }, error: null };
      },
    } as any,
  };
  return { backend, calls, authCalls };
}

function makeBackendBuilder(resolver: Resolver | undefined, calls: Call[]) {
  const defaultResolver: Resolver = (table, op) => ({ data: null, error: null });
  const r = resolver ?? defaultResolver;
  return (table: string) => {
    const call: Call = { table, op: 'select', chain: [] };
    calls.push(call);
    return new FakeBuilder(call, r);
  };
}

const validProfile = { ageYears: 30, weightKg: 70, sex: 'other' as const };

const validReport = {
  title: 'Morning run',
  profileSnapshot: validProfile,
  drugs: [{ drugId: 'caffeine', doseMg: 100, times: [0, 6] }],
  metrics: { cmaxMgPerL: 2.1, tmaxH: 1.2, timeToClearH: 10.5 },
  warnings: [],
  summary: null,
  summarySource: null,
  engineVersion: '0.1.0',
};

const dbReportRow = {
  id: 'b7d525a4-4b66-4e6d-9e35-a85e0475c3e6',
  created_at: '2026-11-09T00:00:00.000Z',
  user_id: uid,
  title: 'Morning run',
  profile_snapshot: validProfile,
  drugs: [{ drugId: 'caffeine', doseMg: 100, times: [0, 6] }],
  metrics: { cmaxMgPerL: 2.1, tmaxH: 1.2, timeToClearH: 10.5 },
  warnings: [],
  summary: null,
  summary_source: null,
  engine_version: '0.1.0',
};

const notSignedIn = { data: null, error: expect.objectContaining({ code: 'not-signed-in' }) };

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

describe('auth helpers', () => {
  it('signInWithGoogle passes https redirectTo and returns {data,error}', async () => {
    const f = makeBackend({});
    const res = await signInWithGoogle('https://app.example/callback', f.backend);
    expect(res).toEqual({ data: { provider: 'google' }, error: null });
    expect(f.authCalls).toContain('signOAuth:google:https://app.example/callback');
  });

  it('signInWithGoogle rejects non-URL redirectTo without touching auth', async res2 => {
    void res2;
    const f = makeBackend({});
    const res = await signInWithGoogle('not-a-url', f.backend);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: 'validation' }) });
    expect(f.authCalls).toEqual([]);
  });

  it('signInWithEmailOtp validates email and returns typed result', async () => {
    const f = makeBackend({});
    const ok = await signInWithEmailOtp('a@b.co', f.backend);
    expect(ok).toEqual({ data: { sent: true }, error: null });
    expect(f.authCalls).toContain('signOtp:a@b.co');
    const bad = await signInWithEmailOtp('nope', f.backend);
    expect(bad).toEqual({ data: null, error: expect.objectContaining({ code: 'validation' }) });
    expect(f.authCalls.filter((c) => c.startsWith('signOtp')).length).toBe(1);
  });

  it('signOut maps SDK errors into {error}', async () => {
    const f = makeBackend({ authError: { message: 'boom', code: 'E_BLOG' } });
    const res = await signOut(f.backend);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: 'E_BLOG', message: 'boom' }) });
  });

  it('getSession returns session info in {data,error} shape', async () => {
    const f = makeBackend({ session: { user: { id: uid, email: 'a@b.co' } } });
    const res = await getSession(f.backend);
    expect(res).toEqual({ data: { session: { userId: uid, email: 'a@b.co' } }, error: null });
  });

  it('onAuthChange forwards callback and returns a working unsubscribe', async () => {
    const f = makeBackend({ session: { user: { id: uid } } });
    let seen: unknown = null;
    const res = onAuthChange((_event, session) => { seen = session; }, f.backend);
    expect(seen).toEqual({ userId: uid, email: null }); // synchronous forward in the mock
    res.data!.unsubscribe();
    expect(f.authCalls).toEqual(expect.arrayContaining(['onAuthStateChange', 'unsubscribe']));
    expect(typeof res.error === 'boolean' || res.error === null).toBe(true);
    expect(res.error).toBeNull();
  });

  it('onAuthChange rejects a non-function callback', () => {
    const f = makeBackend({});
    const res = onAuthChange('nope' as unknown as () => void, f.backend);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: 'validation' }) });
  });
});

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

describe('profile helpers', () => {
  it('getProfile returns not-signed-in without touching tables', async () => {
    const f = makeBackend({});
    await expect(getProfile(f.backend)).resolves.toMatchObject(notSignedIn);
    expect(f.calls).toEqual([]);
  });

  it('getProfile selects its own row and maps the DB row shape', async () => {
    const f = makeBackend({
      session: { user: { id: uid } },
      resolver: (_t, _o) => ({ data: { age_years: 30, weight_kg: 70, sex: 'other' }, error: null }),
    });
    const res = await getProfile(f.backend);
    expect(res).toEqual({ data: { ageYears: 30, weightKg: 70, sex: 'other' }, error: null });
    expect(f.calls.length).toBe(1);
    expect(f.calls[0]).toMatchObject({ table: 'profiles', op: 'select' });
    const chain = [];
    (f.calls[0].chain as string[]) && chain.push(...(f.calls[0].chain as string[]));
    expect(chain.join('|')).toContain('eq:id=' + uid);
    expect(chain.join('|')).toContain('maybeSingle');
  });

  it('saveProfile validates first — bad profile never reaches the client', async () => {
    const f = makeBackend({ session: { user: { id: uid } } });
    const res = await saveProfile({ ageYears: 30, weightKg: 999, sex: 'other' }, f.backend);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: 'validation' }) });
    expect(f.calls).toEqual([]); // no from() call at all
  });

  it('saveProfile upserts snake_case row for the signed-in user', async () => {
    const f = makeBackend({
      session: { user: { id: uid } },
      resolver: (_t, op) => (op === 'upsert' ? { data: { age_years: 30, weight_kg: 70, sex: 'other' }, error: null } : { data: null, error: null }),
    });
    const res = await saveProfile(validProfile, f.backend);
    expect(res.data).toEqual({ ageYears: 30, weightKg: 70, sex: 'other' });
    expect(f.calls[0]).toMatchObject({ table: 'profiles', op: 'upsert' });
    const values = f.calls[0].values as Record<string, unknown>;
    expect(values).toEqual({ id: uid, age_years: 30, weight_kg: 70, sex: 'other' });
  });
});

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------

describe('report helpers', () => {
  it('saveReport validates before any client call', async () => {
    const f = makeBackend({ session: { user: { id: uid } } });
    const res = await saveReport({ ...validReport, title: 'x'.repeat(101) } as never, f.backend);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: 'validation' }) });
    expect(f.calls).toEqual([]);
  });

  it('saveReport inserts into reports with snake_case columns', async () => {
    const f = makeBackend({
      session: { user: { id: uid } },
      resolver: (t, op) => (t === 'reports' && op === 'insert' ? { data: dbReportRow, error: null } : { data: null, error: null }),
    });
    const res = await saveReport(validReport, f.backend);
    expect(res).toEqual({ data: { ...validReport, id: dbReportRow.id, createdAt: dbReportRow.created_at }, error: null });
    const insert = f.calls.find((c) => c.op === 'insert')!;
    expect(insert.table).toBe('reports');
    expect((insert.values as Record<string, unknown>).user_id).toBe(uid);
    expect((insert.values as Record<string, unknown>).engine_version).toBe('0.1.0');
  });

  it('saveReport refuses a returned row owned by another user', async () => {
    const other = { ...dbReportRow, user_id: '76f2ac25-8b8e-474e-97dd-6920c8b3fb1f' };
    const f = makeBackend({
      session: { user: { id: uid } },
      resolver: () => ({ data: other, error: null }),
    });
    const res = await saveReport(validReport, f.backend);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: 'security' }) });
  });

  it('listReports orders user_id scoped newest-first with a bounded limit', async () => {
    const f = makeBackend({
      session: { user: { id: uid } },
      resolver: () => ({ data: [dbReportRow], error: null }),
    });
    const res = await listReports({ limit: 10, before: '2026-01-01T00:00:00Z' }, f.backend);
    expect(res.data?.length).toBe(1);
    expect(f.calls.length).toBe(1);
    const chain = (f.calls[0].chain as string[]).join('|');
    expect(chain).toContain('eq:user_id=' + uid);
    expect(chain).toContain('order:created_at:{"ascending":false}');
    expect(chain).toContain('limit:10');
    expect(chain).toContain('lt:created_at=2026-01-01T00:00:00Z');
  });

  it('listReports validates args', async () => {
    const f = makeBackend({ session: { user: { id: uid } } });
    const res = await listReports({ limit: 1000 } as never, f.backend);
    expect(res.error!.code).toBe('validation');
    expect(f.calls).toEqual([]);
  });

  it('getReport rejects a non-uuid id and requires user scoping', async () => {
    const f = makeBackend({ session: { user: { id: uid } }, resolver: () => ({ data: dbReportRow, error: null }) });
    const bad = await getReport('DROP TABLE reports; --', f.backend);
    expect(bad).toEqual({ data: null, error: expect.objectContaining({ code: 'validation' }) });
    expect(f.calls).toEqual([]);
    const ok = await getReport(dbReportRow.id, f.backend);
    expect(ok.data?.id).toBe(dbReportRow.id);
    const chain = (f.calls[0].chain as string[]).join('|');
    expect(chain).toContain('eq:id=' + dbReportRow.id);
    expect(chain).toContain('eq:user_id=' + uid);
  });

  it('deleteReport scopes by user_id', async () => {
    const f = makeBackend({ session: { user: { id: uid } } });
    const res = await deleteReport(dbReportRow.id, f.backend);
    expect(res).toEqual({ data: { deleted: true }, error: null });
    const del = f.calls.find((c) => c.op === 'delete')!;
    expect(del.table).toBe('reports');
    expect((del.chain as string[]).join('|')).toContain('eq:id=' + dbReportRow.id);
    expect((del.chain as string[]).join('|')).toContain('eq:user_id=' + uid);
  });

  it('deleteAllMyData deletes reports then profile and returns counts', async () => {
    const f = makeBackend({
      session: { user: { id: uid } },
      resolver: (t, op) => {
        if (op !== 'delete') return { data: null, error: null };
        if (t === 'reports') return { data: [{ id: 'a' }, { id: 'b' }], error: null };
        if (t === 'profiles') return { data: [{ id: uid }], error: null };
        return { data: null, error: null };
      },
    });
    const res = await deleteAllMyData(f.backend);
    expect(res).toEqual({ data: { reportsDeleted: 2, profileDeleted: true }, error: null });
    const tables = f.calls.map((c) => c.table + ':' + c.op);
    expect(tables).toEqual(['reports:delete', 'profiles:delete']);
  });

  it('never throws — backend throwing yields {data,error} instead', async () => {
    const throwing: DataBackend = { from: () => { throw new Error('connection went poof'); }, auth: { async getSession() { return { data: { session: { user: { id: uid } } }, error: null }; } } as any };
    const res = await getProfile(throwing);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: expect.any(String), message: expect.stringContaining('poof') }) });
  });
});

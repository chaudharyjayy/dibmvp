import { describe, it, expect } from 'vitest';
import {
  ProfilePayloadSchema,
  ProfileRowSchema,
  ReportInputSchema,
  ReportDrugSchema,
  ReportWarningSchema,
  ListReportsArgsSchema,
  ReportIdSchema,
} from '../schema';

describe('ProfilePayloadSchema', () => {
  it('accepts a valid profile', () => {
    const p = { ageYears: 42, weightKg: 72.5, sex: 'male' };
    expect(ProfilePayloadSchema.safeParse(p).success).toBe(true);
  });

  it('rejects out-of-range weight', () => {
    expect(ProfilePayloadSchema.safeParse({ ageYears: 30, weightKg: 0, sex: 'other' }).success).toBe(false);
    expect(ProfilePayloadSchema.safeParse({ ageYears: 30, weightKg: 400, sex: 'other' }).success).toBe(false);
  });

  it('rejects bad age / unknown sex', () => {
    expect(ProfilePayloadSchema.safeParse({ ageYears: 0, weightKg: 70, sex: 'other' }).success).toBe(false);
    expect(ProfilePayloadSchema.safeParse({ ageYears: 121, weightKg: 70, sex: 'other' }).success).toBe(false);
    expect(ProfilePayloadSchema.safeParse({ ageYears: 30, weightKg: 70, sex: 'woman' }).success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const p = { ageYears: 30, weightKg: 70, sex: 'other', notes: 'extra' };
    expect(ProfilePayloadSchema.safeParse(p).success).toBe(false);
  });
});

describe('ProfileRowSchema', () => {
  it('strips unexpected DB columns', () => {
    const row = { age_years: 30, weight_kg: 70, sex: 'female', updated_at: '2026-01-01T00:00:00Z' };
    const parsed = ProfileRowSchema.safeParse(row);
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.data ?? {})).toEqual(['age_years', 'weight_kg', 'sex']);
  });
});

describe('ReportInputSchema', () => {
  const base = {
    title: 'Morning run',
    profileSnapshot: { ageYears: 30, weightKg: 70, sex: 'other' },
    drugs: [{ drugId: 'caffeine', doseMg: 100, times: [0, 6] }],
    metrics: { cmaxMgPerL: 2.1, tmaxH: 1.2, timeToClearH: 10.5 },
  };

  it('accepts a valid report and applies defaults', () => {
    const parsed = ReportInputSchema.safeParse({ ...base, engineVersion: '0.1.0' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.warnings).toEqual([]);
      expect(parsed.data.summary).toBeNull();
      expect(parsed.data.summarySource).toBeNull();
    }
  });

  it('rejects a title longer than 100 characters', () => {
    const parsed = ReportInputSchema.safeParse({ ...base, title: 'x'.repeat(101), engineVersion: 'v' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a summary longer than 1000 characters', () => {
    const parsed = ReportInputSchema.safeParse({ ...base, summary: 'x'.repeat(1001), engineVersion: 'v' });
    expect(parsed.success).toBe(false);
  });

  it('rejects negative doses and out-of-bound times', () => {
    expect(ReportDrugSchema.safeParse({ drugId: 'caffeine', doseMg: -1, times: [0] }).success).toBe(false);
    expect(ReportDrugSchema.safeParse({ drugId: 'caffeine', doseMg: 100, times: [999] }).success).toBe(false);
  });

  it('rejects unbounded time arrays', () => {
    const times = Array.from({ length: 51 }, (_, i) => i);
    expect(ReportDrugSchema.safeParse({ drugId: 'caffeine', doseMg: 100, times }).success).toBe(false);
  });

  it('rejects more than 5 drugs and empty drug list', () => {
    const five = () => ({ drugId: 'caffeine', doseMg: 100, times: [0] });
    expect(ReportInputSchema.safeParse({ ...base, drugs: [five(), five(), five(), five(), five(), five()], engineVersion: 'v' }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, drugs: [], engineVersion: 'v' }).success).toBe(false);
  });

  it('rejects unknown fields at every level (strict)', () => {
    expect(ReportInputSchema.safeParse({ ...base, extra: 1, engineVersion: 'v' }).success).toBe(false);
    expect(
      ReportInputSchema.safeParse({ ...base, drugs: [{ drugId: 'caffeine', doseMg: 100, times: [0], note: 'hi' }], engineVersion: 'v' }).success
    ).toBe(false);
    expect(
      ReportInputSchema.safeParse({ ...base, metrics: { cmaxMgPerL: 1, tmaxH: 1, timeToClearH: null, extra: 2 }, engineVersion: 'v' }).success
    ).toBe(false);
  });

  it('rejects a bad summary_source and unknown warning severities', () => {
    expect(ReportInputSchema.safeParse({ ...base, summarySource: 'magic', engineVersion: 'v' }).success).toBe(false);
    expect(ReportWarningSchema.safeParse({ pair: 'a+b', severity: 'huge', note: '' }).success).toBe(false);
  });

  it('rejects a long or empty engineVersion', () => {
    expect(ReportInputSchema.safeParse({ ...base, engineVersion: '0'.repeat(21) }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, engineVersion: ' ' }).success).toBe(false);
  });

  it('rejects unknown top-level warnings fields', () => {
    expect(ReportWarningSchema.safeParse({ pair: 'a+b', severity: 'minor', note: 'x', extra: 1 }).success).toBe(false);
  });
});

describe('ListReportsArgsSchema', () => {
  it('applies the default limit 20 and accepts cursored pagination', () => {
    const parsed = ListReportsArgsSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(20);
      expect(parsed.data.before).toBeUndefined();
    }
    expect(ListReportsArgsSchema.safeParse({ limit: 100, before: '2026-01-01T00:00:00Z' }).success).toBe(true);
  });

  it('rejects limit outside 1..100 and unknown fields', () => {
    expect(ListReportsArgsSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(ListReportsArgsSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(ListReportsArgsSchema.safeParse({ limit: 10, extra: true }).success).toBe(false);
  });
});

describe('ReportIdSchema', () => {
  it('requires a uuid', () => {
    expect(ReportIdSchema.safeParse('7f1dd9b7-38af-4e12-95db-1b69d0a9c69a').success).toBe(true);
    expect(ReportIdSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(ReportIdSchema.safeParse('1; DROP TABLE reports').success).toBe(false);
  });
});

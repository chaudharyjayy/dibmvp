import { z } from 'zod';
import { ProfilePayload, ReportInput, ListReportsArgs } from './types';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const ProfilePayloadSchema = z
  .object({
    ageYears: z.number().int('ageYears must be an integer').min(1).max(120),
    weightKg: z.number().gt(0).lt(400),
    sex: z.enum(['female', 'male', 'other']),
  })
  .strict();

/** Row shape as stored in the profiles table. */
export const ProfileRowSchema = z
  .object({
    age_years: z.number().int().min(1).max(120),
    weight_kg: z.number().gt(0).lt(400),
    sex: z.enum(['female', 'male', 'other']),
  })
  .strip();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export const ProfileSnapshotSchema = z
  .object({
    ageYears: z.number().int().min(1).max(120),
    weightKg: z.number().gt(0).lt(400),
    sex: z.enum(['female', 'male', 'other']),
  })
  .strict();

export const ReportDrugSchema = z
  .object({
    drugId: z.string().trim().min(1).max(100),
    doseMg: z.number().min(0).max(10_000),
    times: z.array(z.number().min(0).max(96)).min(1).max(50),
  })
  .strict();

export const ReportWarningSchema = z
  .object({
    pair: z.string().trim().min(1).max(100),
    severity: z.enum(['major', 'moderate', 'minor']),
    note: z.string().max(100),
  })
  .strict();

export const ReportMetricsSchema = z
  .object({
    cmaxMgPerL: z.number().min(0),
    tmaxH: z.number().min(0),
    timeToClearH: z.number().min(0).nullable(),
  })
  .strict();

export const ReportInputSchema = z
  .object({
    title: z.string().trim().max(100),
    profileSnapshot: ProfileSnapshotSchema,
    drugs: z.array(ReportDrugSchema).min(1).max(5),
    metrics: ReportMetricsSchema,
    warnings: z.array(ReportWarningSchema).max(50).default([]),
    summary: z.string().max(1000).nullable().default(null),
    summarySource: z.enum(['ai', 'template']).nullable().default(null),
    engineVersion: z.string().trim().min(1).max(20),
  })
  .strict();

export const ProfileSnapshotRowSchema = z
  .object({
    ageYears: z.number().int().min(1).max(120),
    weightKg: z.number().gt(0).lt(400),
    sex: z.enum(['female', 'male', 'other']),
  })
  .strip();

export const ReportRowSchema = z
  .object({
    id: z.string().uuid(),
    created_at: z.string(),
    user_id: z.string().uuid(),
    title: z.string().max(100),
    profile_snapshot: ProfileSnapshotRowSchema,
    drugs: z
      .array(
        z.object({
          drugId: z.string().min(1).max(100),
          doseMg: z.number().min(0),
          times: z.array(z.number().min(0)).max(50),
        })
      )
      .min(1),
    metrics: ReportMetricsSchema,
    warnings: z
      .array(ReportWarningSchema)
      .default([]),
    summary: z.string().max(1000).nullable(),
    summary_source: z.enum(['ai', 'template']).nullable(),
    engine_version: z.string().min(1).max(20),
  })
  .strip();

export const ListReportsArgsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    before: z.string().datetime().optional(),
  })
  .strict();

export const ReportIdSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Re-exported inferred types (single source of truth)
// ---------------------------------------------------------------------------

export type ProfilePayloadT = z.infer<typeof ProfilePayloadSchema>;
export type ReportInputT = z.infer<typeof ReportInputSchema>;
export type ListArgsT = z.infer<typeof ListReportsArgsSchema>;

// convenience aliases matching the public types.ts shapes
export type _ProfilePayload = ProfilePayload;
export type _ReportInput = ReportInput;
export type _ListReportsArgs = ListReportsArgs;

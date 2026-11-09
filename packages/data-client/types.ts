export interface DataClientError {
  code: string;
  message: string;
}

/** Every helper returns { data, error } and never throws raw SDK errors. */
export type DataClientResult<T> = {
  data: T | null;
  error: DataClientError | null;
};

export type Sex = 'female' | 'male' | 'other';

export interface ProfilePayload {
  ageYears: number;
  weightKg: number;
  sex: Sex;
}

export interface ReportDrug {
  drugId: string;
  doseMg: number;
  times: number[];
}

export interface ReportWarning {
  pair: string;
  severity: 'major' | 'moderate' | 'minor';
  note: string;
}

export interface ReportMetrics {
  cmaxMgPerL: number;
  tmaxH: number;
  timeToClearH: number | null;
}

/** Exactly what the engine produces — no names, no free-text medical notes. */
export interface ReportInput {
  title: string;
  profileSnapshot: ProfilePayload;
  drugs: ReportDrug[];
  metrics: ReportMetrics;
  warnings: ReportWarning[];
  summary: string | null;
  summarySource: 'ai' | 'template' | null;
  engineVersion: string;
}

export interface SavedReport extends ReportInput {
  id: string;
  createdAt: string;
}

export interface DeleteAllResult {
  reportsDeleted: number;
  profileDeleted: boolean;
}

export interface ListReportsArgs {
  /** Max rows fetched. Default 20, hard cap 100. */
  limit?: number;
  /** ISO-8601 cursor: fetch reports created strictly before this time. */
  before?: string;
}

export interface SessionInfo {
  userId: string | null;
  email: string | null;
}

export type AuthEvent = string; // supabase-js AuthChangeEvent

export type UnsubscribeFn = () => void;

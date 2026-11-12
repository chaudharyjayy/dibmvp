/**
 * Thin facade over the standalone helpers, taking the backend explicitly.
 * Used by tests (with a mock backend); createDataClient composes the same
 * functions for real use.
 */
import type { DataBackend } from './backend';
import type { ListReportsArgs, ProfilePayload, ReportInput } from './types';
import {
  getSession as _getSession,
  onAuthChange as _onAuthChange,
  signInWithEmailOtp as _signInWithEmailOtp,
  signInWithGoogle as _signInWithGoogle,
  signOut as _signOut,
} from './auth';
import { getProfile as _getProfile, saveProfile as _saveProfile } from './profile';
import {
  deleteAllMyData as _deleteAllMyData,
  deleteReport as _deleteReport,
  getReport as _getReport,
  listReports as _listReports,
  saveReport as _saveReport,
} from './reports';
import { getDrugPk as _getDrugPk, searchDrugs as _searchDrugs } from './drugs';

export const signInWithGoogle = (redirectTo: string, backend: DataBackend) => _signInWithGoogle(redirectTo, backend);
export const signInWithEmailOtp = (email: string, backend: DataBackend) => _signInWithEmailOtp(email, backend);
export const signOut = (backend: DataBackend) => _signOut(backend);
export const getSession = (backend: DataBackend) => _getSession(backend);
export const onAuthChange = (cb: Parameters<typeof _onAuthChange>[0], backend: DataBackend) => _onAuthChange(cb, backend);

export const getProfile = (backend: DataBackend) => _getProfile(backend);
export const saveProfile = (profile: ProfilePayload, backend: DataBackend) => _saveProfile(profile, backend);

export const saveReport = (report: ReportInput, backend: DataBackend) => _saveReport(report, backend);
export const listReports = (args: ListReportsArgs, backend: DataBackend) => _listReports(args, backend);
export const getReport = (id: string, backend: DataBackend) => _getReport(id, backend);
export const deleteReport = (id: string, backend: DataBackend) => _deleteReport(id, backend);
export const deleteAllMyData = (backend: DataBackend) => _deleteAllMyData(backend);
export const searchDrugs = (q: string, limit: number, backend: DataBackend) => _searchDrugs(q, limit, backend);
export const getDrugPk = (drugId: string, backend: DataBackend) => _getDrugPk(drugId, backend);

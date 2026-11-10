/**
 * api/summary — re-export of the @dib/summary package.
 *
 * Kept so the standalone local dev server (api/summary/server.ts) and the
 * existing tests keep their historic import path. The implementation lives in
 * packages/summary so the deployed Next.js route can import the same code.
 */
export { default } from '@dib/summary';
export * from '@dib/summary';

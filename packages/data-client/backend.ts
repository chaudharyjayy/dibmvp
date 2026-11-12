/**
 * Minimal structural interface the supabase-js client satisfies.
 * Provided so helpers are framework-free and easily mockable — callers pass
 * a real supabase-js v2 client or any object with this shape.
 */
export interface DataBackend {
  from(name: string): any; // supabase-js PostgrestQueryBuilder / our mock
  rpc?(name: string, args?: Record<string, unknown>): any; // supabase-js rpc / our mock
  auth: any; // supabase-js auth client / our mock
}

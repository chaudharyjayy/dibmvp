import { NextResponse } from "next/server";

/**
 * The drug catalogue route: search the openFDA-derived catalogue and read
 * one drug's approved, cited pharmacokinetics.
 *
 * Public data only — both calls run with the anon key, and the database's
 * RLS already scopes what anon may read. The route exists so the browser
 * makes one typed request instead of knowing the Supabase table shapes.
 *
 *   GET /api/drugs?q=ibur          → catalogue hits (id, name, pk status)
 *   GET /api/drugs?id=<drug_id>    → that drug's approved PK row, or null
 *
 * Responses are cached for an hour: the catalogue changes on imports, not
 * between keystrokes.
 */

import { createDataClient } from "@dib/data-client";

const REVALIDATE = 3_600;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith("paste-")) return null;
  return createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";

  const c = client();
  if (!c) {
    return NextResponse.json(
      { error: "supabase-unconfigured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (id) {
    // A single drug's PK. Only exact ids reach the query — nothing else is
    // accepted as a key.
    if (!/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i.test(id)) {
      return NextResponse.json({ error: "bad-drug-id" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const { data, error } = await c.drugs.getDrugPk(id);
    if (error) {
      return NextResponse.json({ error: "catalogue-unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ pk: data }, { headers: { "cache-control": `s-maxage=${REVALIDATE}, stale-while-revalidate=86400` } });
  }

  const { data, error } = await c.drugs.searchDrugs(q.slice(0, 80), 12);
  if (error) {
    return NextResponse.json({ error: "catalogue-unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ hits: data ?? [] }, { headers: { "cache-control": `s-maxage=${REVALIDATE}, stale-while-revalidate=86400` } });
}

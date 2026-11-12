import { NextResponse } from "next/server";

/**
 * The literature route: a thin, cached proxy to PubMed's E-utilities.
 *
 * It exists because the browser should not hold the NCBI identity (an email
 * for rate-limit contact, an optional API key), and because the queries are
 * fixed in code — the route takes a topic name or a catalogue drug id,
 * never raw search text. A drug's name is resolved from the database
 * server-side, so the query template stays the same no matter what the
 * visitor selected.
 *
 * Responses are cached for a day: the queries are curated and the papers of
 * a topic do not change overnight. That also keeps the route far inside
 * NCBI's 3 calls/second courtesy limit.
 */

import { createDataClient } from "@dib/data-client";
import {
  TOPIC_QUERIES,
  parseSummary,
  topicForOrgan,
  type LiteratureResult,
  type LiteratureTopic,
} from "@/lib/pubmed";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "dib-literature-strip";

/** How many PMIDs esearch returns before the summary call trims to three. */
const SEARCH_HITS = 6;

function ncbiParams(extra: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams({ tool: TOOL, ...extra });
  const email = process.env.NCBI_EMAIL;
  if (email) params.set("email", email);
  const apiKey = process.env.NCBI_API_KEY;
  if (apiKey) params.set("api_key", apiKey);
  return params;
}

async function getJson(url: URL, revalidate: number): Promise<unknown> {
  const response = await fetch(url, {
    next: { revalidate },
    headers: { "user-agent": `${TOOL}/1.0` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`PubMed returned ${response.status}`);
  return response.json();
}

/** A drug's PubMed query: the template is fixed; only the name varies, and
 * only because it came from the catalogue, not from the request. */
function drugQuery(name: string): string {
  return `("${name}"[nm] OR "${name}"[mh]) AND (pharmacokinetics[tiab] OR "Drug Interactions"[mh] OR adverse effects[tiab]) AND english[la]`;
}

async function catalogueName(drugId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith("paste-")) return null;
  try {
    const c = createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
    const { data } = await c.drugs.searchDrugs(drugId, 1);
    const hit = data?.find((h) => h.id === drugId);
    return hit?.name ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const drugId = url.searchParams.get("drugId")?.trim() ?? "";
  const requested = url.searchParams.get("topic") ?? "";

  let query: string;
  let label: string;
  if (drugId) {
    // Only exact catalogue ids are accepted; the name comes from the DB.
    if (!/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i.test(drugId)) {
      return NextResponse.json({ error: "bad-drug-id" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const name = await catalogueName(drugId);
    if (!name) {
      return NextResponse.json(
        { error: "drug-not-found" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    query = drugQuery(name);
    label = name;
  } else {
    // Only the fixed topics are served; unknown values fall back to the
    // whole-body query rather than reaching PubMed with arbitrary text.
    const validTopics = Object.keys(TOPIC_QUERIES) as LiteratureTopic[];
    const topic: LiteratureTopic = validTopics.includes(requested as LiteratureTopic)
      ? (requested as LiteratureTopic)
      : topicForOrgan(null);
    query = TOPIC_QUERIES[topic];
    label = topic;
  }

  let articles: LiteratureResult["articles"] = [];
  let error: LiteratureResult["error"] = null;
  try {
    const searchUrl = new URL(`${EUTILS}/esearch.fcgi`);
    searchUrl.search = ncbiParams({
      db: "pubmed",
      term: query,
      retmode: "json",
      retmax: String(SEARCH_HITS),
      sort: "relevance",
    }).toString();
    const search = (await getJson(searchUrl, 86_400)) as {
      esearchresult?: { idlist?: string[] };
    };
    const pmids = search.esearchresult?.idlist ?? [];
    if (pmids.length > 0) {
      const summaryUrl = new URL(`${EUTILS}/esummary.fcgi`);
      summaryUrl.search = ncbiParams({
        db: "pubmed",
        id: pmids.join(","),
        retmode: "json",
      }).toString();
      const summary = await getJson(summaryUrl, 86_400);
      articles = parseSummary("whole-body", summary).articles;
    }
  } catch {
    error = "pubmed-unreachable";
  }

  return NextResponse.json(
    { label, articles, error },
    { headers: { "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=43200" } },
  );
}

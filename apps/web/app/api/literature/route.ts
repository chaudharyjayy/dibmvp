import { NextResponse } from "next/server";

/**
 * The literature route: a thin, cached proxy to PubMed's E-utilities.
 *
 * It exists because the browser should not hold the NCBI identity (an email
 * for rate-limit contact, an optional API key), and because the topic
 * queries are fixed in code — the route takes a topic name, never raw
 * search text.
 *
 * Responses are cached for a day: the queries are curated and the papers of
 * a topic do not change overnight. That also keeps the route far inside
 * NCBI's 3 calls/second courtesy limit.
 */

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = url.searchParams.get("topic") ?? "";
  const validTopics = Object.keys(TOPIC_QUERIES) as LiteratureTopic[];
  // Only the fixed topics are served; unknown values fall back to the
  // whole-body query rather than reaching PubMed with arbitrary text.
  const topic: LiteratureTopic = validTopics.includes(requested as LiteratureTopic)
    ? (requested as LiteratureTopic)
    : topicForOrgan(null);
  const query = TOPIC_QUERIES[topic];

  let result: LiteratureResult;
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
    if (pmids.length === 0) {
      result = { topic, articles: [], error: null };
    } else {
      const summaryUrl = new URL(`${EUTILS}/esummary.fcgi`);
      summaryUrl.search = ncbiParams({
        db: "pubmed",
        id: pmids.join(","),
        retmode: "json",
      }).toString();
      const summary = await getJson(summaryUrl, 86_400);
      result = parseSummary(topic, summary);
    }
  } catch {
    result = { topic, articles: [], error: "pubmed-unreachable" };
  }

  return NextResponse.json(result, {
    headers: { "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=43200" },
  });
}

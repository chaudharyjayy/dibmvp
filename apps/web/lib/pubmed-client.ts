/**
 * PubMed, called straight from the browser.
 *
 * The strip needs a handful of field-tagged queries — the fixed topic
 * queries and one drug query whose name comes from the catalogue. NCBI's
 * E-utilities is a public endpoint with open CORS (`esearch`/`esummary`),
 * so the static site can call it directly; there is no server in the loop,
 * and nothing here lets the request carry visitor-typed search text.
 *
 * The module caches per session so walking the body does not re-ask the
 * same question twice. Until CI sets NCBI credentials through the nightly
 * checks, requests run at the anonymous 3-per-second allowance, which the
 * small fixed query set and this cache stay well under.
 */

import {
  drugTopicQuery,
  parseSummary,
  TOPIC_QUERIES,
  topicForOrgan,
  type LiteratureResult,
  type LiteratureTopic,
} from "@/lib/pubmed";
import { searchCatalogue } from "@/lib/catalogue";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "dib-literature-strip";
const SEARCH_HITS = 6;

export type DrugLiterature = {
  label: string | null;
  articles: LiteratureResult["articles"];
  error: "drug-not-found" | "pubmed-unreachable" | "bad-drug-id" | null;
};

type CacheKey = string;
const cache = new Map<CacheKey, Promise<unknown>>();

async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { headers: { "user-agent": `${TOOL}/1.0` } });
  if (!response.ok) throw new Error(`PubMed returned ${response.status}`);
  return response.json();
}

function cached<T>(key: CacheKey, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const pending = load().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

async function articlesForQuery(query: string): Promise<LiteratureResult["articles"]> {
  const searchUrl = new URL(`${EUTILS}/esearch.fcgi`);
  searchUrl.search = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: String(SEARCH_HITS),
    sort: "relevance",
    tool: TOOL,
  }).toString();
  const search = (await getJson(searchUrl)) as { esearchresult?: { idlist?: string[] } };
  const pmids = search.esearchresult?.idlist ?? [];
  if (pmids.length === 0) return [];
  const summaryUrl = new URL(`${EUTILS}/esummary.fcgi`);
  summaryUrl.search = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "json",
    tool: TOOL,
  }).toString();
  const summary = await getJson(summaryUrl);
  return parseSummary("whole-body", summary).articles;
}

export async function fetchTopicLiterature(
  requested: string,
): Promise<{ label: string; articles: LiteratureResult["articles"]; error: "pubmed-unreachable" | null }> {
  const valid = Object.keys(TOPIC_QUERIES) as LiteratureTopic[];
  const topic: LiteratureTopic = valid.includes(requested as LiteratureTopic)
    ? (requested as LiteratureTopic)
    : topicForOrgan(null);
  try {
    const articles = await cached(`topic:${topic}`, () => articlesForQuery(TOPIC_QUERIES[topic]));
    return { label: topic, articles, error: null };
  } catch {
    return { label: topic, articles: [], error: "pubmed-unreachable" };
  }
}

export async function fetchDrugLiterature(rawId: string): Promise<DrugLiterature> {
  if (!/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i.test(rawId.trim())) {
    return { label: null, articles: [], error: "bad-drug-id" };
  }
  const id = rawId.trim();
  const search = await searchCatalogue(id, 1);
  if (search.error || !search.hits) {
    return { label: null, articles: [], error: "drug-not-found" };
  }
  const hit = search.hits.find((h) => h.id === id);
  if (!hit) {
    return { label: null, articles: [], error: "drug-not-found" };
  }
  try {
    const articles = await cached(`drug:${id}`, () => articlesForQuery(drugTopicQuery(hit.name)));
    return { label: hit.name, articles, error: null };
  } catch {
    return { label: hit.name, articles: [], error: "pubmed-unreachable" };
  }
}

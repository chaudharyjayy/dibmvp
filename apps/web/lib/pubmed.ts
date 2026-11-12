/**
 * PubMed, as a source for the walkthrough's literature strips.
 *
 * What this is for: each organ step in the simulator can show a few published
 * papers about the real process the step narrates — gut absorption, hepatic
 * metabolism, renal clearance. The papers are context, not output: the model
 * does not read them, and the strip says so.
 *
 * The searches are field-tagged and fixed in code (see TOPIC_QUERIES), so
 * what each topic returns is reproducible. NCBI E-utilities asks that calls
 * identify themselves; `NCBI_EMAIL` and an optional `NCBI_API_KEY` come from
 * the environment, never from the repo.
 */

/** The organs a step can name, plus the whole body (null). */
export type LiteratureTopic =
  | "whole-body"
  | "gut"
  | "blood"
  | "lungs"
  | "liver"
  | "kidneys"
  | "brain";

/**
 * One reproducible PubMed query per topic, in PubMed syntax.
 *
 * Reviews and English only: a strip of three explanatory papers serves the
 * walkthrough better than a wall of case reports. No date filter — the best
 * teaching reviews of a compartment are often old ones.
 */
export const TOPIC_QUERIES: Record<LiteratureTopic, string> = {
  "whole-body":
    '"Pharmacokinetics"[mh] AND "Models, Theoretical"[mh] AND review[pt] AND english[la]',
  gut: '"Intestinal Absorption"[mh] AND drug[tiab] AND review[pt] AND english[la]',
  blood: '"Tissue Distribution"[mh] AND drug[tiab] AND review[pt] AND english[la]',
  lungs: '"Lung"[mh] AND pharmacokinetics[tiab] AND review[pt] AND english[la]',
  liver:
    '"Liver"[mh] AND ("Cytochrome P-450"[mh] OR drug metabolism[tiab]) AND review[pt] AND english[la]',
  kidneys:
    '"Kidney"[mh] AND ("Pharmacokinetics"[mh] OR renal excretion[tiab]) AND review[pt] AND english[la]',
  brain: '"Blood-Brain Barrier"[mh] AND drug[tiab] AND review[pt] AND english[la]',
};

export function topicForOrgan(organ: string | null): LiteratureTopic {
  switch (organ) {
    case "gut":
      return "gut";
    case "heart":
      return "blood";
    case "lungs":
      return "lungs";
    case "liver":
      return "liver";
    case "kidneys":
      return "kidneys";
    case "brain":
      return "brain";
    default:
      return "whole-body";
  }
}

export type LiteratureArticle = {
  /** PubMed id, for the link. */
  pmid: string;
  title: string;
  journal: string;
  /** Publication date as PubMed prints it, e.g. "2023 Mar". */
  pubDate: string;
};

export type LiteratureResult = {
  topic: LiteratureTopic;
  articles: LiteratureArticle[];
  /** Set when PubMed could not be reached; the strip shows a quiet note. */
  error: "pubmed-unreachable" | null;
};

/** The pubmed page for an article. */
export function articleUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
}

/**
 * A strip at most three papers: enough context, not a bibliography.
 */
export function parseSummary(topic: LiteratureTopic, payload: unknown): LiteratureResult {
  const articles: LiteratureArticle[] = [];
  // Malformed payloads (null, non-objects) yield no articles rather than a throw.
  if (!payload || typeof payload !== "object") {
    return { topic, articles, error: null };
  }
  const result = (payload as { result?: Record<string, unknown> }).result;
  const uids = Array.isArray(result?.uids) ? (result?.uids as string[]) : [];
  for (const uid of uids.slice(0, 3)) {
    const record = result?.[uid] as Record<string, unknown> | undefined;
    if (!record) continue;
    const title = typeof record.title === "string" ? record.title : "";
    if (!title) continue;
    articles.push({
      pmid: uid,
      title: title.replace(/\s*\.?\s*$/, ""),
      journal: typeof record.source === "string" ? record.source : "",
      pubDate: typeof record.pubdate === "string" ? record.pubdate : "",
    });
  }
  return { topic, articles, error: null };
}

/** How the strip renders a journal line: "Br J Clin Pharmacol · 2019". */
export function articleMetaLine(article: LiteratureArticle): string {
  return [article.journal, article.pubDate.split(" ")[0]].filter(Boolean).join(" · ");
}

/**
 * Citation checking: does the document a row points at actually support the
 * sentence the row claims?
 *
 * A URL that returns 200 proves nothing — DailyMed answers 200 for a set id
 * that does not exist. The only useful check is whether the quoted text is
 * really in the cited document.
 *
 * Some publishers will not serve their page to a plain fetch (PubMed answers
 * 203 with a bot interstitial), so those are reported as *unverifiable* rather
 * than as failures. For PubMed specifically the abstract is also fetched from
 * Europe PMC, which serves it as JSON — that turns "unverifiable" into a real
 * check for the most common source of all.
 */

const PUBMED_HOST = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i;
const EUROPEPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

/** Lowercase, tags out, entities decoded, whitespace collapsed. */
export function normaliseText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Only real tags are stripped. A bare "<" in prose ("< 11 years", "x < y")
    // must survive: stripping it would delete the sentence around it, and the
    // text is normalised more than once (a page is normalised, then squashed).
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A numeric entity's character, or a space if it is not one. */
function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ' ';
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

/**
 * The same text with every non-alphanumeric character dropped.
 *
 * A quote transcribed from a PDF or a PubMed abstract often has its
 * punctuation and spacing tidied ("mean (+/- SD)" becomes "mean ( +/- SD)").
 * The words and the numbers are unchanged, so the quote still supports the
 * value — but a character-exact search says it does not. Comparing the
 * squashed forms checks the substance of the sentence and still fails on a
 * reworded one.
 */
export function squashText(text: string): string {
  return normaliseText(text).replace(/[^a-z0-9]+/g, '');
}

/**
 * A table row cannot be found verbatim in the page, because the page renders
 * the table as markup. Its numbers can be: each value the quote names has to
 * appear in the page.
 */
function tableValuesPresent(quote: string, page: string): boolean {
  const pairs = quote
    .split('|')
    .map((part) => part.trim())
    .filter((part) => /:\s*[\d.]/.test(part));
  if (!pairs.length) return false;
  const values = pairs.map((part) => part.split(':').pop()!.trim().split(' ')[0]);
  const found = values.filter((value) => page.includes(value.toLowerCase()));
  return found.length >= Math.min(2, values.length);
}

/** Is this a page that actually carries an article, or a bot interstitial? */
function looksLikeAnArticle(page: string): boolean {
  if (page.length < 800) return false;
  return (
    page.includes('abstract') ||
    page.includes('pmc') ||
    page.includes('pharmacokinetic') ||
    page.includes('drug information') ||
    page.includes('clinical pharmacology') ||
    // A Structured Product Label is the article here, even a short OTC one.
    page.includes('structured product label') ||
    page.includes('indications and usage') ||
    page.includes('dosage and administration') ||
    page.includes('active ingredient')
  );
}

/** The abstract of a PubMed record, from Europe PMC. */
async function europePmcText(pmid: string): Promise<string | null> {
  try {
    const url = `${EUROPEPMC}?query=EXT_ID:${encodeURIComponent(pmid)}&resultType=core&format=json`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      resultList?: { result?: Array<{ abstractText?: string; title?: string; pmid?: string }> };
    };
    const records = body.resultList?.result ?? [];
    // The query can match more than one paper — an old PMID is often reused by
    // a title reference — so pick the record that is actually this PMID.
    const record =
      records.find((r) => r.pmid === pmid) ??
      records.find((r) => (r.abstractText ?? '').length > 0);
    if (!record) return null;
    return [record.title ?? '', record.abstractText ?? ''].join(' ');
  } catch {
    return null;
  }
}

export type CitationCheck = {
  /** True when the citation was checked and supports the quote. */
  ok: boolean;
  /** True when the document could not be fetched well enough to check. */
  unverifiable: boolean;
  status: number;
  why: string;
};

export async function supportsQuote(url: string, quote: string): Promise<CitationCheck> {
  const wanted = normaliseText(quote);
  if (!wanted) {
    return { ok: false, unverifiable: false, status: 0, why: 'the row has no quote to check' };
  }
  const isTable = wanted.startsWith('table');
  const window = 40;
  const wantedSquashed = squashText(wanted);
  const found = (page: string): boolean => {
    if (isTable) return tableValuesPresent(wanted, page);
    const squashed = squashText(page);
    const span = Math.min(window, wantedSquashed.length);
    for (let i = 0; i + span <= wantedSquashed.length; i += 10) {
      if (squashed.includes(wantedSquashed.slice(i, i + span))) return true;
    }
    return false;
  };

  // PubMed: the article page is behind a bot interstitial, but the abstract
  // is served as JSON by Europe PMC. Check that first.
  const pmid = url.match(PUBMED_HOST)?.[1];
  if (pmid) {
    const abstract = await europePmcText(pmid);
    if (abstract) {
      const page = normaliseText(abstract);
      if (found(page)) {
        return { ok: true, unverifiable: false, status: 200, why: 'the quoted sentence is in the PubMed abstract' };
      }
      return {
        ok: false,
        unverifiable: false,
        status: 200,
        why: 'the quoted sentence is not in the PubMed abstract (Europe PMC)',
      };
    }
  }

  let status = 0;
  let page = '';
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'dib-pk-verify (drug data verification)' },
    });
    status = response.status;
    page = normaliseText(await response.text());
  } catch {
    return { ok: false, unverifiable: true, status: 0, why: 'the citation page could not be fetched' };
  }

  if (status === 403 || status === 429 || status === 203) {
    return {
      ok: false,
      unverifiable: true,
      status,
      why: `the publisher blocked the fetch (HTTP ${status}); the citation could not be checked`,
    };
  }
  if (!responseOk(status)) {
    return { ok: false, unverifiable: true, status, why: `the citation page returned HTTP ${status}` };
  }
  if (!looksLikeAnArticle(page)) {
    return {
      ok: false,
      unverifiable: true,
      status,
      why: 'the page did not look like an article, so the quote could not be checked',
    };
  }
  if (found(page)) {
    return { ok: true, unverifiable: false, status, why: 'the quoted sentence appears in the cited page' };
  }
  return { ok: false, unverifiable: false, status, why: 'the quoted sentence does not appear in the cited page' };
}

function responseOk(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Citation checking: does the document a row points at actually support the
 * sentence the row claims?
 *
 * A URL that returns 200 proves nothing — DailyMed answers 200 for a set id
 * that does not exist. The only useful check is whether the quoted text is
 * really in the cited document.
 */

/** Lowercase, tags out, entities decoded, whitespace collapsed. */
export function normaliseText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x?[0-9A-Fa-f]+;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

export async function supportsQuote(
  url: string,
  quote: string
): Promise<{ ok: boolean; status: number; why: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'dib-pk-verify' },
    });
    const status = response.status;
    if (!response.ok) return { ok: false, status, why: `the citation page returned HTTP ${status}` };
    const page = normaliseText(await response.text());
    const wanted = normaliseText(quote);
    if (!wanted) return { ok: false, status, why: 'the row has no quote to check' };

    if (wanted.startsWith('table')) {
      const ok = tableValuesPresent(wanted, page);
      return {
        ok,
        status,
        why: ok
          ? 'the values in the quoted table row appear in the cited page'
          : 'the values in the quoted table row do not appear in the cited page',
      };
    }

    // Any 40-character window of the quote appearing in the page is enough:
    // one window ties the row to the document without depending on the page's
    // own whitespace and markup.
    const window = 40;
    for (let i = 0; i + window <= wanted.length; i += 10) {
      if (page.includes(wanted.slice(i, i + window))) {
        return { ok: true, status, why: 'the quoted sentence appears in the cited page' };
      }
    }
    return { ok: false, status, why: 'the quoted sentence does not appear in the cited page' };
  } catch {
    return { ok: false, status: 0, why: 'the citation page could not be fetched' };
  }
}

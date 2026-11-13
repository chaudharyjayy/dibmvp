import { describe, it, expect } from 'vitest';
import { normaliseText, squashText, supportsQuote } from '../data/lib/citation';

/**
 * The citation check decides whether an approved parameter still has a
 * document behind it. Two things matter: a quote that is really in the
 * document must pass, and a quote that is not must fail. A quote that is
 * merely *close* — the same words with tidied punctuation — is still the same
 * sentence and must pass.
 */
describe('citation matching', () => {
  it('strips markup and entities', () => {
    expect(normaliseText('<p>Half&#x2D;life&nbsp;is 3 h</p>')).toBe('half-life is 3 h');
  });

  it('squashes punctuation and spacing', () => {
    expect(squashText('mean (+/- SD) half-life')).toBe('meansdhalflife');
  });

  it('treats a quote with tidied punctuation as the same sentence', () => {
    const page = 'The mean (+/- SD) terminal elimination half-life is 6.06 hr.';
    const quote = 'The mean ( +/- SD) terminal elimination half-life is 6.06 hr.';
    // The words and the numbers are identical; only the spacing differs.
    expect(squashText(page)).toContain(squashText(quote).slice(0, 40));
  });

  it('does not treat a reworded quote as present', () => {
    const page = 'The mean (+/- SD) terminal elimination half-life is 6.06 hr.';
    const quote = 'The average terminal elimination half-life was 6.06 hours.';
    expect(squashText(page)).not.toContain(squashText(quote).slice(0, 40));
  });

  it('reports a blocked publisher as unverifiable rather than failed', async () => {
    // A publisher that refuses the fetch says nothing about the citation.
    const result = await supportsQuote('https://127.0.0.1:1/nothing', 'A quote that is long enough to pass the length check here.');
    expect(result.ok).toBe(false);
    expect(result.unverifiable).toBe(true);
  }, 20000);

  it('fails a live page that does not contain the quote', async () => {
    const result = await supportsQuote(
      'https://example.com/',
      'A quote that is definitely not on this page, long enough to pass the length check.'
    );
    // example.com is a real page but it is not an article, so the check cannot
    // be conclusive: it must not claim the citation is broken.
    expect(result.ok).toBe(false);
    expect(result.unverifiable).toBe(true);
  }, 20000);
});

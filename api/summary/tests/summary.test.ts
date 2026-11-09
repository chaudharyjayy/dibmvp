import { describe, it, expect } from 'vitest';
import {
  SummaryRequestSchema,
  summarize,
  replyIsAcceptable,
  buildTemplateSummary,
  rateLimit,
  BANNED_PHRASES,
} from '../index';
import type { SummaryRequest } from '../index';

const validInput: SummaryRequest = {
  drugs: [{ name: 'paracetamol', doseMg: 500, times: [0] }],
  metrics: { cmaxMgPerL: 5.2, tmaxH: 0.75, timeToClearH: 6.0 },
  warnings: [{ pair: 'caffeine+paracetamol', severity: 'minor', note: 'TEST PAIR (citation TODO)' }],
};

describe('request validation', () => {
  it('accepts a valid body', () => {
    expect(() => SummaryRequestSchema.parse(validInput)).not.toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() => SummaryRequestSchema.parse({ ...validInput, extra: 1 })).toThrow();
    expect(() =>
      SummaryRequestSchema.parse({
        ...validInput,
        metrics: { ...validInput.metrics, extra: 1 },
      })
    ).toThrow();
  });

  it('rejects free-text fields over 100 chars', () => {
    const long = 'x'.repeat(101);
    expect(() =>
      SummaryRequestSchema.parse({ ...validInput, drugs: [{ name: long, doseMg: 1, times: [0] }] })
    ).toThrow();
    expect(() =>
      SummaryRequestSchema.parse({
        ...validInput,
        warnings: [{ pair: long, severity: 'minor', note: 'ok' }],
      })
    ).toThrow();
  });
});

describe('reply guard rails', () => {
  const good =
    'The simulated dose of paracetamol at 500 mg produced a level of 5.2 mg/L around 0.75 h from t=0 h; the level fell to about 6.0 h. Population-average, educational only.';
  const withBanned = `Results suggest ${BANNED_PHRASES[2]} 500 mg. Population-average.`;
  const ungrounded = 'The level was 9.9 mg/L. Population-average, educational only.';

  it('accepts a grounded reply with no banned phrases', () => {
    expect(replyIsAcceptable(good, validInput)).toBe(true);
  });

  it('rejects a reply containing banned phrases', () => {
    expect(replyIsAcceptable(withBanned, validInput)).toBe(false);
  });

  it('rejects a reply with numbers absent from the input', () => {
    expect(replyIsAcceptable(ungrounded, validInput)).toBe(false);
  });
});

describe('summarize()', () => {
  it('uses the AI reply when it passes checks', async () => {
    const reply =
      'For paracetamol at 500 mg (t=0 h), Cmax was 5.2 mg/L at 0.75 h and clearance passed 6.0 h. Population-average, educational only.';
    const out = await summarize(validInput, { apiKey: 'k', reply });
    expect(out.source).toBe('ai');
    expect(out.summary).toBe(reply);
  });

  it('falls back to template on banned-phrase reply', async () => {
    const out = await summarize(validInput, {
      apiKey: 'k',
      reply: `${BANNED_PHRASES[2]} 500 mg now.`,
    });
    expect(out.source).toBe('template');
  });

  it('falls back to template when a number is not in the input', async () => {
    const out = await summarize(validInput, { apiKey: 'k', reply: 'Cmax was 77.4 mg/L. Educational only.' });
    expect(out.source).toBe('template');
  });

  it('falls back to template when the API key is missing', async () => {
    const out = await summarize(validInput, { apiKey: null });
    expect(out.source).toBe('template');
  });

  it('falls back to template when the API call fails', async () => {
    const out = await summarize(validInput, {
      apiKey: 'k',
      fetchImpl: (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch,
    });
    expect(out.source).toBe('template');
  });

  it('template summary contains no banned phrases', async () => {
    const out = await summarize(validInput, { apiKey: null });
    const lower = out.summary.toLowerCase();
    for (const p of BANNED_PHRASES) {
      expect(lower).not.toContain(p);
    }
  });
});

describe('rate limiting', () => {
  it('allows 20 per window then blocks', () => {
    expect(rateLimit('ip-test', 0)).toBe(true);
    let allowed = 1;
    for (let i = 1; i < 20; i++) if (rateLimit('ip-test', i * 1000)) allowed++;
    expect(allowed).toBe(20);
    expect(rateLimit('ip-test', 21 * 1000)).toBe(false);
    expect(rateLimit('ip-test', 65_000)).toBe(true); // window rolled over
  });
});

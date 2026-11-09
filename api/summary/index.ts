/**
 * api/summary — optional AI summary serverless function (Vercel style,
 * also runnable locally as a plain function).
 *
 * POST { drugs:[{name,doseMg,times[]}], metrics:{cmaxMgPerL,tmaxH,timeToClearH},
 *        warnings:[{pair,severity,note}] }
 * -> { summary: string, source: "ai" | "template" }
 *
 * Nothing from the request body is ever logged. Calls the Claude API using
 * CLAUDE_API_KEY / CLAUDE_MODEL; every reply is verified (numbers ⊆ input,
 * no banned phrases) and falls back to a deterministic template otherwise.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const shortText = z.string().max(100);

export const SummaryRequestSchema = z
  .object({
    drugs: z.array(
      z
        .object({
          name: shortText,
          doseMg: z.number().nonnegative(),
          times: z.array(z.number().nonnegative()).max(50),
        })
        .strict()
    ),
    metrics: z
      .object({
        cmaxMgPerL: z.number().nonnegative(),
        tmaxH: z.number().nonnegative(),
        timeToClearH: z.number().nonnegative().nullable(),
      })
      .strict(),
    warnings: z.array(
      z
        .object({
          pair: shortText,
          severity: z.enum(['major', 'moderate', 'minor']),
          note: shortText,
        })
        .strict()
    ),
  })
  .strict();

export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------
export const BANNED_PHRASES = ['safe' + ' dose', 'recommended' + ' dose', 'you should' + ' take'];
const NUM_RE = /-?\d+(?:\.\d+)?/g;

export function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.some((p) => lower.includes(p));
}

/** Every number in `reply` must appear somewhere in the request input. */
export function replyNumbersAreGrounded(reply: string, input: SummaryRequest): boolean {
  const inputNums: number[] = (JSON.stringify(input).match(NUM_RE) ?? []).map(Number);
  const replyNums = (reply.match(NUM_RE) ?? []).map(Number);
  if (replyNums.length === 0) return false; // a fact-free reply is not a summary
  return replyNums.every((v) => inputNums.some((u) => Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(u))));
}

export function replyIsAcceptable(reply: string, input: SummaryRequest): boolean {
  if (!reply || reply.trim().length === 0) return false;
  if (containsBannedPhrase(reply)) return false;
  return replyNumbersAreGrounded(reply, input);
}

// ---------------------------------------------------------------------------
// Template summary (no AI)
// ---------------------------------------------------------------------------
export function buildTemplateSummary(input: SummaryRequest): string {
  const drugBits = input.drugs.map((d) => `${d.name} at ${d.doseMg} mg`).join(', ');
  const timeBits = input.drugs.length ? `${Math.min(...input.drugs.flatMap((d) => d.times))} h` : '0 h';
  const metricsBits = [
    `Cmax ${input.metrics.cmaxMgPerL.toFixed(3)} mg/L`,
    `Tmax ${input.metrics.tmaxH.toFixed(2)} h`,
    `time to clear ${input.metrics.timeToClearH == null ? 'beyond the simulated window' : `${input.metrics.timeToClearH.toFixed(2)} h`}`,
  ].join(', ');
  const warnBits = input.warnings.length
    ? ` Input flags: ${input.warnings.map((w) => `${w.pair} (${w.severity}, ${w.note})`).join('; ')}.`
    : '';
  return `${drugBits ? `Simulated ${drugBits} starting at ${timeBits}.` : 'Simulated run.'} Population-average results: ${metricsBits}.${warnBits} Educational simulator only.`;
}

// ---------------------------------------------------------------------------
// Claude call (optional)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = [
  'You rewrite PK simulation facts as a plain-language summary under 120 words.',
  'Use ONLY the numbers present in the input facts; do not introduce, convert, or round new numbers.',
  'Provide no dosage or medical advice, and never use the phrases on this forbid list: ' + BANNED_PHRASES.join('; ') + '.',
  'State that results are population-average estimates from an educational simulator.',
].join(' ');

interface ClaudeConfig {
  apiKey?: string | null;
  model?: string | null;
  fetchImpl?: typeof fetch;
}

async function callClaude(input: SummaryRequest, cfg: ClaudeConfig): Promise<string> {
  const apiKey = cfg.apiKey;
  if (!apiKey) throw new Error('missing CLAUDE_API_KEY');
  const model = cfg.model || 'claude-3-5-haiku-latest';
  const impl = cfg.fetchImpl ?? fetch;
  const res = await impl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ facts: input }) }],
    }),
  });
  if (!res.ok) throw new Error(`claude api status ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join(' ')
    .trim();
  if (!text) throw new Error('claude api returned no text');
  return text;
}

/**
 * Full summarization path. Missing key, failed API call, ungrounded numbers,
 * or banned phrases all fall back to the deterministic template summary.
 * A pre-supplied `cfg.reply` (test injection) bypasses the network.
 */
export async function summarize(
  input: SummaryRequest,
  cfg: ClaudeConfig & { reply?: string | null } = {}
): Promise<{ summary: string; source: 'ai' | 'template' }> {
  let reply: string | null = null;
  try {
    reply = cfg.reply != null ? cfg.reply : cfg.apiKey ? await callClaude(input, cfg) : null;
  } catch {
    reply = null;
  }
  if (reply && replyIsAcceptable(reply, input)) {
    return { summary: reply, source: 'ai' };
  }
  return { summary: buildTemplateSummary(input), source: 'template' };
}

// ---------------------------------------------------------------------------
// Rate limiting — 20 requests / min / IP (per process instance)
// ---------------------------------------------------------------------------
const buckets = new Map<string, number[]>();
export const RATE_LIMIT = 20;

export function rateLimit(ip: string, now = Date.now()): boolean {
  const windowMs = 60_000;
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= RATE_LIMIT) {
    buckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return true;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any): Promise<void> {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = req?.headers?.origin;
  if (origin && allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req?.method === 'OPTIONS') {
    res.status?.(204);
    res.end();
    return;
  }

  if (req?.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const ip = req?.socket?.remoteAddress || req?.headers?.['x-forwarded-for'] || 'unknown';
  if (!rateLimit(String(ip))) {
    res.status(429).json({ error: 'rate limit exceeded' });
    return;
  }

  let parsed: SummaryRequest;
  try {
    parsed = SummaryRequestSchema.parse(req?.body);
  } catch {
    res.status(400).json({ error: 'invalid request body' });
    return;
  }

  const result = await summarize(parsed, {
    apiKey: process.env.CLAUDE_API_KEY || null,
    model: process.env.CLAUDE_MODEL || null,
  });

  res.status(200).json(result);
}

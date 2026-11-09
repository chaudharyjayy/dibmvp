# api/summary

Optional serverless function (Vercel style, runnable locally) that rewrites the
engine's numbers into a plain-language summary.

## Exports

- `default handler(req, res)` — POST `{ drugs:[…], metrics:{…}, warnings:[…] }`
  → `{ summary, source: "ai" | "template" }`.
- `summarize(input, cfg?)` — core path; falls back to the deterministic
  template whenever the Claude reply fails a guard rail (or when
  `CLAUDE_API_KEY` is missing / the API errors).
- `buildTemplateSummary(input)`, `replyIsAcceptable(reply, input)`, `rateLimit(ip, now)`.

## Guard rails

- zod strict schema: unknown fields rejected, free-text fields ≤ 100 chars.
- Every number in an AI reply must appear in the input; any phrase on the
  `BANNED_PHRASES` forbid list (see `data/` copy rules) forces the fallback.
- Rate limit 20 req/min/IP; nothing from the request body is logged; CORS only
  for `ALLOWED_ORIGIN`.

## Usage

```ts
import handler from '../api/summary';

await handler(
  { method: 'POST', body: { drugs: [], metrics: { cmaxMgPerL: 0, tmaxH: 0, timeToClearH: null }, warnings: [] }, headers: {}, socket: {} },
  { status: (c: number) => ({ json: (o: unknown) => o }), setHeader: () => {} }
);
```

Env: `CLAUDE_API_KEY`, `CLAUDE_MODEL` (optional), `ALLOWED_ORIGIN`.

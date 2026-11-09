/**
 * Local dev server for api/summary — no framework dependencies.
 * Wraps node:http req/res into the minimal interface the Vercel-style
 * handler expects (setHeader, status().json(), end()).
 *
 * Run:  npm run dev:summary      (http://localhost:3001/api/summary)
 */
import { createServer } from 'node:http';
import handler, { rateLimit } from './index';

const PORT = Number(process.env.PORT || 3001);

type Minimal = any; // adapter shapes; the handler is untyped-any friendly

const adapter = (req: Minimal, res: Minimal) => {
  const r = res as any;
  r.status = (code: number) => {
    r.statusCode = code;
    return { json: (body: unknown) => r.end(JSON.stringify(body)) };
  };
  r.end = r.end.bind(r);
  r.setHeader = r.setHeader.bind(r);
  return r;
};

const server = createServer(async (req, res) => {
  // Dev convenience: GET returns usage instructions instead of a cold 405.
  if (req.method === 'GET') {
    (res as any).statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify(
        {
          endpoint: '/api/summary',
          method: 'POST',
          'content-type': 'application/json',
          example: {
            drugs: [{ name: 'paracetamol', doseMg: 500, times: [0] }],
            metrics: { cmaxMgPerL: 5.2, tmaxH: 0.75, timeToClearH: 6.0 },
            warnings: [],
          },
        },
        null,
        2
      )
    );
    return;
  }

  const adapted = adapter(req, res);
  // read the body
  let body = '';
  for await (const chunk of req) body += chunk;
  let parsed: unknown = undefined;
  try {
    parsed = body ? JSON.parse(body) : undefined;
  } catch {
    parsed = undefined; // handler validation will reject it
  }

  // Vercel-style: body may be pre-parsed; pass raw object through
  (req as any).body = parsed;

  // Per-request rate limiting already lives in the handler via the socket/IP;
  // the handler reads it from req.socket.remoteAddress / headers, both
  // available on a node:http request. This check here mirrors it for clients
  // that bypass headers entirely.
  const ip = req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    adapted.status(429).json({ error: 'rate limit exceeded' });
    return;
  }

  try {
    await handler(req, adapted);
  } catch (err) {
    adapted.status(500).json({ error: 'internal error' });
    console.error('[summary] handler error:', (err as Error).message);
  }
});

server.listen(PORT, () => {
  console.log(`api/summary listening on http://localhost:${PORT}/api/summary`);
});

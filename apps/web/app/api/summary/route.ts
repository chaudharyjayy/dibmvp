import handler from "@dib/summary";

/**
 * Next.js route adapter for the Vercel-style @dib/summary handler.
 * Same validation, rate limiting, grounding checks and template fallback as
 * the standalone function — this is the copy that actually ships with the app.
 */
async function adapt(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined; // handler's zod validation rejects it
  }

  const headers = new Headers();
  let status = 200;
  let payload: unknown = null;

  const res = {
    setHeader: (key: string, value: string) => {
      headers.set(key, value);
    },
    status: (code: number) => {
      status = code;
      return {
        json: (value: unknown) => {
          payload = value;
        },
      };
    },
    end: () => {},
  };

  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  await handler(
    {
      method: req.method,
      body,
      headers: {
        origin: req.headers.get("origin") ?? "",
        "x-forwarded-for": forwarded,
      },
      socket: { remoteAddress: forwarded.split(",")[0]?.trim() || "unknown" },
    },
    res
  );

  headers.set("content-type", "application/json");
  return new Response(payload === null ? null : JSON.stringify(payload), { status, headers });
}

export async function POST(req: Request) {
  return adapt(req);
}

export async function OPTIONS(req: Request) {
  return adapt(req);
}

export async function GET(req: Request) {
  return adapt(req);
}

import type { NextConfig } from "next";

/**
 * Two build modes:
 *
 * - default: the app as a Next.js app (dev server, or a serverful host).
 * - STATIC_EXPORT=1: `output: "export"` for GitHub Pages (chaudharyjayy.github.io/dibmvp/).
 *   GitHub Pages is static hosting — no server functions — so the static
 *   build drops the experimental server features and gives the whole app
 *   a base path. API routes do not exist in this tree anymore; the browser
 *   talks to Supabase and PubMed directly (both are anon/public endpoints
 *   with open CORS), the same way saved reports and sign-in already work.
 */

const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  /* One source of truth for the base path: the browser inlines this at build time,
     so client code can resolve static assets (the anatomy models) under it. */
  env: { NEXT_PUBLIC_BASE_PATH: staticExport ? "/dibmvp" : "" },
  /* Allow importing the framework-free workspace packages (TS source). */
  transpilePackages: ["@dib/data-client", "@dib/engine", "@dib/summary"],
  ...(staticExport
    ? {
        output: "export" as const,
        basePath: "/dibmvp",
        trailingSlash: true,
      }
    : { cacheComponents: true, partialPrefetching: true }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

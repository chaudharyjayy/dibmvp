import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow importing the framework-free workspace packages (TS source). */
  transpilePackages: ["@dib/data-client", "@dib/engine", "@dib/summary"],
  cacheComponents: true,
  partialPrefetching: true,
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

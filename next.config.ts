import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, copied into the Docker image.
  output: "standalone",
  poweredByHeader: false,
  // Development logs each Server Function call with its arguments: the Garmin key (D-101) and
  // the first account's password would be printed in clear. Off (04, pitfall 14).
  logging: { serverFunctions: false },
  // Read at request time by the ZIP export (feature 12): the data dictionary it ships (D-50).
  outputFileTracingIncludes: {
    "/api/export": ["./docs/03-data-model.md"],
  },
  // Cache Components stays off for now (D-29): with it, auth redirects in production became
  // client-side redirects after a prerendered shell. Revisit before Next.js 17 enables it.
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, copied into the Docker image.
  output: "standalone",
  poweredByHeader: false,
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

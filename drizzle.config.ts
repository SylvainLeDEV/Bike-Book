import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same .env files as Next.js (.env, .env.local…), for DATA_DIR.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: {
    url: path.join(process.env.DATA_DIR || "./data", "bikebook.db"),
  },
  strict: true,
  verbose: true,
});

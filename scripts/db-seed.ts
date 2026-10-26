// Fills a development database with fictitious data. Refuses to run in production.
//   pnpm db:seed            creates the demo account if it does not exist
//   pnpm db:seed --reset    deletes the demo account and its workspace, then creates them again
import { loadEnvConfig } from "@next/env";
import { closeDb } from "@/server/db/client";
import { DEMO_ACCOUNT, seedDemoData } from "@/server/db/seed";
import { getEnv } from "@/server/env";

loadEnvConfig(process.cwd());

async function main() {
  if (getEnv().nodeEnv === "production") {
    throw new Error("Refusing to seed a production database (NODE_ENV=production).");
  }
  const reset = process.argv.includes("--reset");
  const result = await seedDemoData({ reset });
  console.log(
    result.created
      ? `Demo account created: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`
      : `Demo account already exists: ${DEMO_ACCOUNT.email} (pnpm db:seed --reset to recreate it)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);

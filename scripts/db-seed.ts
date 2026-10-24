// Fills a development database with fictitious data. Refuses to run in production.
import { loadEnvConfig } from "@next/env";
import { closeDb } from "@/server/db/client";
import { DEMO_ACCOUNT, seedDemoData } from "@/server/db/seed";
import { getEnv } from "@/server/env";

loadEnvConfig(process.cwd());

async function main() {
  if (getEnv().nodeEnv === "production") {
    throw new Error("Refusing to seed a production database (NODE_ENV=production).");
  }
  const result = await seedDemoData();
  console.log(
    result.created
      ? `Demo account created: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`
      : `Demo account already exists: ${DEMO_ACCOUNT.email}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);

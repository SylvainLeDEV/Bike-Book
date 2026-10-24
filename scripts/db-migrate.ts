// Applies pending migrations to the database in DATA_DIR. The app also does this on startup.
import { loadEnvConfig } from "@next/env";
import { closeDb, initDatabase } from "@/server/db/client";
import { getEnv } from "@/server/env";

loadEnvConfig(process.cwd());
initDatabase();
closeDb();
console.log(`Database is up to date in ${getEnv().dataDir}`);

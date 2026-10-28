import "server-only";
import { initDatabase } from "@/server/db";
import { getEnv } from "@/server/env";
import { clearPartialUploads } from "@/server/files/storage";

/**
 * Server start (Node.js runtime, from instrumentation.ts): checks the configuration, then opens
 * the database and applies pending migrations, so a bad configuration, a misconfigured DATA_DIR
 * or a failed migration stops the app at boot instead of on first use.
 */
export function startServer(): void {
  try {
    getEnv();
    initDatabase();
    // Uploads cut short by a crash or a restart (feature 10). Not awaited: nothing depends on it.
    void clearPartialUploads().catch((error) =>
      console.error("Partial uploads not cleared:", error),
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") throw error;
    // Next.js only logs a failed register() and keeps serving, with HTTP 500 on every route
    // (D-28): exit instead, so the container stops and its logs show why.
    console.error("Bike-Book cannot start:", error);
    process.exit(1);
  }
}

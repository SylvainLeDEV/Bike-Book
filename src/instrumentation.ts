/**
 * Runs once when the server starts: checks the configuration, opens the database and applies
 * pending migrations, then starts the scheduler of the Garmin import (src/server/startup.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startServer } = await import("@/server/startup");
  startServer();
}

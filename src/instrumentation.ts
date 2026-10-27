/**
 * Runs once when the server starts: checks the configuration, opens the database and applies
 * pending migrations (src/server/startup.ts). Phase 1.5 will also start the scheduler here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startServer } = await import("@/server/startup");
  startServer();
}

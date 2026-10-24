/**
 * Runs once when the server starts: opens the database and applies pending migrations, so a
 * misconfigured DATA_DIR or a failed migration stops the app at boot instead of on first use.
 * Phase 1.5 will also start the scheduler here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { initDatabase } = await import("@/server/db");
  initDatabase();
}

import "server-only";
import { getEnv } from "@/server/env";
import { syncAllGarmin } from "@/server/integrations/garmin/sync";

// In-process scheduled jobs (04: no queue, no system cron). Today: the Garmin import every
// GARMIN_SYNC_INTERVAL_H hours (D-101), the first one a minute after the server starts. A run
// still going when the next is due is skipped by the import's own lock.

const FIRST_RUN_DELAY_MS = 60_000;

/** One scheduler per process, even when development reloads this module. */
const state = globalThis as typeof globalThis & { __bikeBookScheduler?: { stop: () => void } };

export function startScheduler(): void {
  if (state.__bikeBookScheduler) return;
  const { syncIntervalH } = getEnv().garmin;
  if (syncIntervalH === 0) return;
  const run = () => {
    void syncAllGarmin().catch((error) => console.error("Garmin import failed:", error));
  };
  const first = setTimeout(run, FIRST_RUN_DELAY_MS);
  const every = setInterval(run, syncIntervalH * 3600 * 1000);
  // Never keeps the process alive on its own.
  first.unref();
  every.unref();
  state.__bikeBookScheduler = {
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
      state.__bikeBookScheduler = undefined;
    },
  };
}

export function stopScheduler(): void {
  state.__bikeBookScheduler?.stop();
}

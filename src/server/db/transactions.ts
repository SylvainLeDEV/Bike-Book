import "server-only";
import { getDb } from "./client";

// Several data-access calls as one write (D-90): the MCP tools create a bike and its parts, all
// or nothing, and preview a write without keeping it. The data-access functions open their own
// transactions, which become savepoints of the outer one (better-sqlite3), so they make exactly
// the checks they make alone.

/**
 * Runs `write` in one transaction: if it throws, nothing it wrote is kept. A data-access call
 * that refuses (`{ ok: false }`) does not throw: `write` throws to undo the calls before it.
 */
export function atomically<T>(write: () => T): T {
  return getDb().transaction(() => write());
}

/** Carries the dry run's result out of the transaction it rolls back. */
class DryRunRollback<T> extends Error {
  constructor(readonly value: T) {
    super("Dry run rolled back");
  }
}

/**
 * Runs `write` (data-access calls, then the reads that describe the result) in a transaction
 * that is always rolled back, and returns what `write` returned: a dry run that makes the real
 * write's checks and leaves the database untouched. An error thrown by `write` passes through.
 *
 * Only for writes that touch the database alone: a function that deletes files after its commit
 * (attachments, D-76) must never run here.
 */
export function previewWrite<T>(write: () => T): T {
  try {
    getDb().transaction(() => {
      throw new DryRunRollback(write());
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.value as T;
    throw error;
  }
  throw new Error("previewWrite: the transaction did not roll back");
}

import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

// Internal to src/server/db: everything else goes through the data-access layer (index.ts).

export type Db = BetterSQLite3Database<typeof schema>;

/** The handle a transaction callback receives. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const DATABASE_FILE_NAME = "bikebook.db";

/** Resolved from the working directory: the repository root in dev, /app in the image. */
const MIGRATIONS_FOLDER = path.join(process.cwd(), "src/server/db/migrations");

type Connection = { db: Db; sqlite: Database.Database };

/**
 * Opens (or creates) the database file, sets the pragmas and applies pending migrations.
 * `migrationsFolder` is only overridden by tests.
 */
export function openDatabase(file: string, migrationsFolder = MIGRATIONS_FOLDER): Connection {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("busy_timeout = 5000");
    const db = drizzle({ client: sqlite, schema });
    migrateWithoutForeignKeys(sqlite, db, migrationsFolder);
    sqlite.pragma("foreign_keys = ON");
    return { db, sqlite };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

/**
 * Applies pending migrations with foreign keys off, then checks them (D-69).
 *
 * drizzle-kit rebuilds a table to change a column (CREATE __new_x, copy, DROP x, RENAME). With
 * foreign keys on, DROP TABLE deletes every row first and fires ON DELETE CASCADE on the child
 * tables. The pragma is a no-op inside a transaction and drizzle runs all pending migrations in
 * one, so it must be off before migrate() starts. A migration that leaves a dangling reference
 * stops the app: it is already committed, so restore the backup taken before the upgrade.
 */
function migrateWithoutForeignKeys(sqlite: Database.Database, db: Db, migrationsFolder: string) {
  sqlite.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder });
  const violations = sqlite.pragma("foreign_key_check") as { table: string; parent: string }[];
  if (violations.length > 0) {
    const pairs = [...new Set(violations.map((v) => `${v.table} -> ${v.parent}`))].join(", ");
    throw new Error(
      `Migrations left ${violations.length} broken foreign key reference(s) (${pairs}). ` +
        "Restore the backup taken before the upgrade.",
    );
  }
}

// Kept on globalThis so that hot reloads in development reuse one connection.
const globalForDb = globalThis as typeof globalThis & { bikeBookDb?: Connection };

export function getDb(): Db {
  globalForDb.bikeBookDb ??= openDatabase(path.resolve(getEnv().dataDir, DATABASE_FILE_NAME));
  return globalForDb.bikeBookDb.db;
}

/** Opens the database and applies migrations now rather than on first query (server start). */
export function initDatabase(): void {
  getDb();
}

/** Closes the shared connection (scripts and tests). */
export function closeDb(): void {
  globalForDb.bikeBookDb?.sqlite.close();
  globalForDb.bikeBookDb = undefined;
}

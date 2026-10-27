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

/** Opens (or creates) the database file, sets the pragmas and applies pending migrations. */
export function openDatabase(file: string): Connection {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, sqlite };
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

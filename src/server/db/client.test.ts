import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./client";

// Migrations shaped like drizzle-kit output, applied by openDatabase to a scratch database.
const createTables = `CREATE TABLE \`parents\` (\`id\` integer PRIMARY KEY NOT NULL, \`name\` text NOT NULL);
--> statement-breakpoint
CREATE TABLE \`children\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`parent_id\` integer NOT NULL REFERENCES \`parents\`(\`id\`) ON DELETE cascade
);`;

// What drizzle-kit generates to change a column of an existing table.
const rebuildParents = `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_parents\` (\`id\` integer PRIMARY KEY NOT NULL, \`name\` text NOT NULL, \`note\` text);
--> statement-breakpoint
INSERT INTO \`__new_parents\`("id", "name") SELECT "id", "name" FROM \`parents\`;--> statement-breakpoint
DROP TABLE \`parents\`;--> statement-breakpoint
ALTER TABLE \`__new_parents\` RENAME TO \`parents\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;`;

let dir: string;
let migrationsFolder: string;
let file: string;

function writeMigrations(...sqls: string[]) {
  mkdirSync(path.join(migrationsFolder, "meta"), { recursive: true });
  const entries = sqls.map((sql, idx) => {
    const tag = `000${idx}_test`;
    writeFileSync(path.join(migrationsFolder, `${tag}.sql`), sql);
    return { idx, version: "6", when: 1_800_000_000_000 + idx, tag, breakpoints: true };
  });
  writeFileSync(
    path.join(migrationsFolder, "meta/_journal.json"),
    JSON.stringify({ version: "7", dialect: "sqlite", entries }),
  );
}

function seedParentWithChildren() {
  const { sqlite } = openDatabase(file, migrationsFolder);
  sqlite.exec("INSERT INTO parents (id, name) VALUES (1, 'Parent')");
  sqlite.exec("INSERT INTO children (id, parent_id) VALUES (1, 1), (2, 1)");
  sqlite.close();
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bike-book-migrations-"));
  migrationsFolder = path.join(dir, "migrations");
  file = path.join(dir, "test.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase migrations", () => {
  it("would lose child rows if a table rebuild ran with foreign keys on", () => {
    // The hazard the guard exists for: the migration's own PRAGMA is ignored in a transaction.
    writeMigrations(createTables);
    seedParentWithChildren();
    const sqlite = new Database(file);
    sqlite.pragma("foreign_keys = ON");
    sqlite.transaction(() =>
      sqlite.exec(rebuildParents.replaceAll("--> statement-breakpoint", "")),
    )();
    expect(sqlite.prepare("SELECT count(*) AS n FROM children").get()).toEqual({ n: 0 });
    sqlite.close();
  });

  it("keeps child rows through a table rebuild and turns foreign keys back on", () => {
    writeMigrations(createTables);
    seedParentWithChildren();
    writeMigrations(createTables, rebuildParents);

    const { sqlite } = openDatabase(file, migrationsFolder);
    expect(sqlite.prepare("SELECT count(*) AS n FROM children").get()).toEqual({ n: 2 });
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    // The children still reference the rebuilt table: deleting the parent cascades.
    sqlite.exec("DELETE FROM parents WHERE id = 1");
    expect(sqlite.prepare("SELECT count(*) AS n FROM children").get()).toEqual({ n: 0 });
    sqlite.close();
  });

  it("refuses to open when a migration leaves a dangling reference", () => {
    writeMigrations(createTables);
    seedParentWithChildren();
    writeMigrations(createTables, "DELETE FROM `parents`;");

    expect(() => openDatabase(file, migrationsFolder)).toThrow(
      /2 broken foreign key reference\(s\) \(children -> parents\)/,
    );
  });
});

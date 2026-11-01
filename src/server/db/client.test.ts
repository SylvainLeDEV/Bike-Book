import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("keeps the setups through migration 0012 (D-84): new columns empty, values intact", () => {
    // The real migrations, first up to 0011, then all of them.
    const real = path.join(process.cwd(), "src/server/db/migrations");
    const journal = JSON.parse(readFileSync(path.join(real, "meta/_journal.json"), "utf8"));
    const upTo = (tag: string) => {
      rmSync(migrationsFolder, { recursive: true, force: true });
      cpSync(real, migrationsFolder, { recursive: true });
      const last = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
      writeFileSync(
        path.join(migrationsFolder, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, last + 1) }),
      );
    };
    upTo("0011_setups");
    const before = openDatabase(file, migrationsFolder).sqlite;
    before.exec(`
      INSERT INTO workspaces (id, name, created_at) VALUES (1, 'Garage', 0);
      INSERT INTO bikes (id, workspace_id, name, discipline, created_at, updated_at)
        VALUES (1, 1, 'Spectral', 'enduro', 0, 0);
      INSERT INTO components (id, bike_id, type_code, position, origin, installed_at, created_at, updated_at)
        VALUES (1, 1, 'rear_shock', 'none', 'stock', 0, 0, 0);
      INSERT INTO suspension_specs (component_id, spring_type, travel_mm, low_speed_rebound_max_clicks, created_at, updated_at)
        VALUES (1, 'air', 65, 12, 0, 0);
      INSERT INTO setups (id, bike_id, set_on, created_at, updated_at) VALUES (1, 1, '2026-10-17', 0, 0);
      INSERT INTO setup_suspensions (setup_id, component_id, air_pressure_psi, sag_mm, low_speed_rebound_clicks)
        VALUES (1, 1, 195, 17, 7);
    `);
    before.close();

    upTo("0012_setup_targets");
    const { sqlite } = openDatabase(file, migrationsFolder);
    expect(sqlite.prepare("SELECT * FROM suspension_specs").get()).toMatchObject({
      travel_mm: 65,
      wheel_travel_mm: null,
      low_speed_rebound_max_clicks: 12,
    });
    expect(sqlite.prepare("SELECT * FROM setup_suspensions").get()).toMatchObject({
      air_pressure_psi: 195,
      sag_mm: 17,
      sag_target_percent: null,
      low_speed_rebound_clicks: 7,
    });
    expect(() => sqlite.exec("UPDATE setup_suspensions SET sag_target_percent = 120")).toThrow(
      /CHECK/,
    );
    sqlite.close();
  });
});

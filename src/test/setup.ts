import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import { closeDb } from "@/server/db/client";

// Each test file gets its own empty data directory, hence its own database.
const dataDir = mkdtempSync(path.join(tmpdir(), "bike-book-test-"));
process.env.DATA_DIR = dataDir;

afterAll(() => {
  closeDb();
  rmSync(dataDir, { recursive: true, force: true });
});

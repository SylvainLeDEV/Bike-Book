import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { exportWorkspaceTables } from "@/server/db";
import { parseDataModel } from "./data-model";

const SAMPLE = `
## Core tables

### \`bikes\`

Status: **Built**.

| Field | Type | Notes |
|-------|------|-------|
| \`id\` | integer PK | |
| \`discipline\` | enum, required | See [values](#bike-values) |
| \`brand\`, \`model\` | text | "Canyon" |

| Column | Value | Meaning |
|--------|-------|---------|
| \`discipline\` | \`road\` | Road bike |

### Workshop (D-33 to D-42)

| Field | Type | Notes |
|-------|------|-------|
| \`ignored\` | text | No table named above |

**\`purchase_links\`**

| Field | Type | Notes |
|-------|------|-------|
| \`url\` | text, nullable | Shown \\| never fetched |
`;

describe("parseDataModel", () => {
  const tables = parseDataModel(SAMPLE);

  it("reads the field table under each table's heading or bold name", () => {
    expect([...tables.keys()]).toEqual(["bikes", "purchase_links"]);
    expect(tables.get("bikes")!.get("id")).toEqual({ type: "integer PK", notes: "" });
    expect(tables.get("purchase_links")!.get("url")).toEqual({
      type: "text, nullable",
      notes: "Shown | never fetched",
    });
  });

  it("gives every column of a shared row the same notes, links turned into text", () => {
    const bikes = tables.get("bikes")!;
    expect(bikes.get("brand")).toEqual(bikes.get("model"));
    expect(bikes.get("discipline")!.notes).toBe("See values");
    expect(bikes.has("road")).toBe(false);
  });

  // D-50 point 6: docs/03 describes every exported column, so the export can ship its notes.
  it("finds every exported column in docs/03-data-model.md", () => {
    const docs = parseDataModel(
      fs.readFileSync(path.join(process.cwd(), "docs/03-data-model.md"), "utf8"),
    );
    const missing = exportWorkspaceTables(createTestContext("Alex")).flatMap((table) =>
      table.columns
        .filter((column) => !docs.get(table.name)?.has(column.name))
        .map((column) => `${table.name}.${column.name}`),
    );
    expect(missing).toEqual([]);
  });
});

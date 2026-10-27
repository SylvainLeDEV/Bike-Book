import "server-only";

/*
 * Reads the column notes of the data dictionary (docs/03-data-model.md, D-50) so the export can
 * ship them next to the columns. A table starts at a heading or a bold line naming it
 * (### `bikes`, **`purchase_links`**); its columns are the rows of the "Field | Type | Notes"
 * table that follows. A row may name several columns (`brand`, `model`).
 */

export type ColumnDoc = { type: string; notes: string };

const TABLE_START = /^(?:#{2,4} |\*\*)`([a-z0-9_]+)`/;
const FIELD_HEADER = /^\|\s*Field\s*\|\s*Type\s*\|\s*Notes\s*\|/;

/** Markdown links become their text; escaped pipes become pipes. */
function plain(text: string) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll("\\|", "|")
    .trim();
}

export function parseDataModel(markdown: string): Map<string, Map<string, ColumnDoc>> {
  const tables = new Map<string, Map<string, ColumnDoc>>();
  let table: string | null = null;
  let inFields = false;

  for (const line of markdown.split(/\r?\n/)) {
    const start = TABLE_START.exec(line);
    if (start) {
      table = start[1];
      inFields = false;
      continue;
    }
    if (/^#{1,4} /.test(line)) {
      table = null;
      inFields = false;
      continue;
    }
    if (table && FIELD_HEADER.test(line)) {
      inFields = true;
      continue;
    }
    if (!inFields) continue;
    if (!line.startsWith("|")) {
      // The field table ended; a later one under the same heading belongs to another table.
      inFields = false;
      table = null;
      continue;
    }
    const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split(/(?<!\\)\|/);
    if (cells.length < 3 || /^\s*:?-+/.test(cells[0])) continue;
    const doc = { type: plain(cells[1]), notes: plain(cells.slice(2).join("|")) };
    const columns = tables.get(table!) ?? new Map<string, ColumnDoc>();
    for (const [, name] of cells[0].matchAll(/`([a-z0-9_]+)`/g)) columns.set(name, doc);
    tables.set(table!, columns);
  }
  return tables;
}

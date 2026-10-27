import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { createBike, exportWorkspaceTables, type BikeData } from "@/server/db";
import {
  columnUnit,
  exportEntries,
  exportFileName,
  exportStream,
  readDataModel,
  type ExportMeta,
} from "./archive";

const bike = {
  name: "Gravel alu",
  discipline: "gravel",
  isElectric: false,
  brand: "Specialized",
  model: "Diverge E5",
  modelYear: 2022,
  frameSize: "56",
  wheelSize: "700c",
  color: null,
  frameSerial: null,
  weightG: 9_900,
  purchasedOn: "2023-05-20",
  purchasePriceCents: 95_000,
  purchaseShop: null,
  boughtUsed: true,
  initialDistanceM: 1_850_000,
  initialWearS: 0,
  status: "active",
  statusChangedOn: null,
  salePriceCents: null,
  notes: "Acheté d'occasion, « sans historique », virgule, incluse",
} satisfies BikeData;

function setup() {
  const ctx = createTestContext("Alex");
  createBike(ctx, bike);
  const meta: ExportMeta = {
    // 23:30 UTC on 25 October is already the 26th in Paris.
    exportedAt: Date.parse("2026-10-25T23:30:00Z"),
    timeZone: "Europe/Paris",
    workspace: ctx.workspace,
  };
  const tables = exportWorkspaceTables(ctx);
  return { ctx, meta, tables, entries: exportEntries(tables, readDataModel(), meta) };
}

const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe("columnUnit", () => {
  it("reads the unit from the column name (D-50)", () => {
    expect(columnUnit("distance_m")).toBe("metres");
    expect(columnUnit("interval_wear_s")).toBe("seconds");
    expect(columnUnit("sale_price_cents")).toBe("euro cents");
    expect(columnUnit("weight_g")).toBe("grams");
    expect(columnUnit("started_at")).toMatch(/milliseconds since 1970-01-01 UTC/);
    expect(columnUnit("performed_on")).toMatch(/YYYY-MM-DD/);
    expect(columnUnit("runs_count")).toBe("count");
    expect(columnUnit("name")).toBeNull();
    expect(columnUnit("model")).toBeNull();
  });
});

describe("exportEntries", () => {
  it("lists the readme, the dictionary, the data model and two files per table", () => {
    const { entries, tables } = setup();
    expect(entries.slice(0, 3).map((e) => e.name)).toEqual([
      "LISEZMOI.txt",
      "dictionary.json",
      "data-model.md",
    ]);
    expect(entries).toHaveLength(3 + tables.length * 2);
    expect(entries.map((e) => e.name)).toContain("csv/bikes.csv");
    expect(entries.map((e) => e.name)).toContain("json/inventory_movements.json");
  });

  it("describes each column with its type, unit, allowed values and notes", () => {
    const { entries, ctx } = setup();
    const dictionary = JSON.parse(text(entries.find((e) => e.name === "dictionary.json")!.data));
    expect(dictionary).toMatchObject({
      format: "bike-book-export",
      format_version: 1,
      time_zone: "Europe/Paris",
      exported_at: "2026-10-25T23:30:00.000Z",
      workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
    });
    const bikes = dictionary.tables.find((t: { name: string }) => t.name === "bikes");
    expect(bikes).toMatchObject({ row_count: 1, files: { csv: "csv/bikes.csv" } });
    const column = (name: string) => bikes.columns.find((c: { name: string }) => c.name === name);
    expect(column("purchase_price_cents")).toMatchObject({
      type: "integer",
      unit: "euro cents",
      nullable: true,
    });
    expect(column("discipline").allowed_values).toContain("gravel");
    expect(column("purchase_shop_id").references).toEqual({ table: "shops", column: "id" });
    expect(column("weight_g").notes).toMatch(/Grams/);
    expect(column("created_at")).toMatchObject({
      format: "timestamp_ms",
      unit: expect.any(String),
    });
  });

  it("writes the rows as CSV and as typed JSON", () => {
    const { entries } = setup();
    const csv = text(entries.find((e) => e.name === "csv/bikes.csv")!.data);
    const [header, row] = csv.split("\r\n");
    expect(header.split(",")).toContain("initial_distance_m");
    expect(row).toContain('"Acheté d\'occasion, « sans historique », virgule, incluse"');
    const [json] = JSON.parse(text(entries.find((e) => e.name === "json/bikes.json")!.data));
    expect(json).toMatchObject({
      name: "Gravel alu",
      is_electric: false,
      bought_used: true,
      initial_distance_m: 1_850_000,
      wheel_size: "700c",
      color: null,
      purchased_on: "2023-05-20",
    });
    expect(typeof json.created_at).toBe("number");
  });

  it("explains the content in French, dated in the configured time zone", () => {
    const { entries, meta } = setup();
    const readme = text(entries[0].data);
    expect(readme).toContain(`Export Bike-Book — ${meta.workspace.name}`);
    // formatDate joins with no-break spaces, matched by \s.
    expect(readme).toMatch(/Exporté le 26\soctobre\s2026 à 00:30 \(Europe\/Paris\)/);
    expect(readme).toContain("jamais exportés");
    expect(exportFileName(meta)).toBe("bike-book-2026-10-26.zip");
  });

  it("still exports without the data model, then without notes", () => {
    const { tables, meta } = setup();
    const entries = exportEntries(tables, null, meta);
    expect(entries.map((e) => e.name)).not.toContain("data-model.md");
    const dictionary = JSON.parse(text(entries[1].data));
    expect(dictionary.tables[0].columns[0].notes).toBeNull();
  });

  it("streams a ZIP archive", async () => {
    const { entries, meta } = setup();
    const reader = exportStream(entries, meta).getReader();
    const chunks: Uint8Array[] = [];
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      chunks.push(read.value);
    }
    const archive = Buffer.concat(chunks);
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt16LE(archive.length - 12)).toBe(entries.length);
  });
});

import { eq, getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import { exportWorkspaceTables, findAccessContext, NOT_EXPORTED_TABLES } from "./index";
import * as schema from "./schema";
import { DEMO_ACCOUNT, seedDemoData } from "./seed";

const NOW = Date.parse("2026-10-25T10:00:00Z");

/** One row in every workspace-owned table, written directly (the flows are tested elsewhere). */
function otherGarage() {
  const ctx = createTestContext("Lou");
  const db = getDb();
  const workspaceId = ctx.workspace.id;
  const shop = db
    .insert(schema.shops)
    .values({ workspaceId, kind: "physical", name: "Atelier du Port" })
    .returning()
    .get();
  const bike = db
    .insert(schema.bikes)
    .values({ workspaceId, name: "Vélo de Lou", discipline: "city", purchaseShopId: shop.id })
    .returning()
    .get();
  db.insert(schema.ruleTemplates)
    .values({
      workspaceId,
      title: "Modèle de Lou",
      intervalDays: 30,
      source: "personal",
      evidenceLevel: "estimate",
    })
    .run();
  const item = db
    .insert(schema.inventoryItems)
    .values({ workspaceId, kind: "part", name: "Chambre à air", category: "wheels", unit: "piece" })
    .returning()
    .get();
  db.insert(schema.inventoryItemBikes).values({ itemId: item.id, bikeId: bike.id }).run();
  const link = db
    .insert(schema.purchaseLinks)
    .values({ itemId: item.id, shopId: shop.id, priceCents: 600 })
    .returning()
    .get();
  const part = db
    .insert(schema.components)
    .values({
      bikeId: bike.id,
      typeCode: "tire",
      position: "front",
      origin: "stock",
      installedAt: new Date(NOW),
    })
    .returning()
    .get();
  db.insert(schema.rides)
    .values({
      bikeId: bike.id,
      startedAt: new Date(NOW),
      rideType: "commute",
      distanceM: 8000,
      totalTimeS: 1500,
    })
    .run();
  const rule = db
    .insert(schema.maintenanceRules)
    .values({
      bikeId: bike.id,
      title: "Pression des pneus",
      intervalDays: 14,
      counterStartAt: new Date(NOW),
    })
    .returning()
    .get();
  db.insert(schema.tasks)
    .values({ workspaceId, bikeId: bike.id, title: "Régler la sonnette" })
    .run();
  const event = db
    .insert(schema.maintenanceEvents)
    .values({
      bikeId: bike.id,
      performedOn: "2026-10-24",
      title: "Pneus regonflés",
      performedBy: "self",
    })
    .returning()
    .get();
  const line = db
    .insert(schema.maintenanceItems)
    .values({ eventId: event.id, action: "inspected", componentId: part.id, ruleId: rule.id })
    .returning()
    .get();
  db.insert(schema.inventoryMovements)
    .values({
      itemId: item.id,
      occurredAt: new Date(NOW),
      kind: "purchase",
      quantityDelta: 2,
      purchaseLinkId: link.id,
      createdBy: ctx.user.id,
    })
    .run();
  db.insert(schema.inventoryMovements)
    .values({
      itemId: item.id,
      occurredAt: new Date(NOW),
      kind: "use",
      quantityDelta: -1,
      maintenanceItemId: line.id,
    })
    .run();
  const file = (owner: Partial<typeof schema.attachments.$inferInsert>, n: number) => ({
    ...owner,
    kind: "invoice" as const,
    storagePath: `uploads/2026/10/${String(workspaceId * 10 + n).padStart(32, "0")}.pdf`,
    originalName: "facture.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1200,
    sha256: "0".repeat(64),
  });
  db.insert(schema.attachments)
    .values([file({ maintenanceEventId: event.id }, 7), file({ inventoryItemId: item.id }, 8)])
    .run();
  return ctx;
}

async function demoGarage() {
  await seedDemoData({ today: "2026-10-25" });
  const user = getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_ACCOUNT.email))
    .get()!;
  const ctx = findAccessContext(user)!;
  getDb()
    .insert(schema.ruleTemplates)
    .values({
      workspaceId: ctx.workspace.id,
      title: "Modèle du garage",
      intervalDays: 90,
      source: "personal",
      evidenceLevel: "estimate",
    })
    .run();
  return ctx;
}

const SHARED = ["component_types"];

/** Rows of a table as JSON strings, for set comparisons. */
function rowsOf(tables: ReturnType<typeof exportWorkspaceTables>, name: string) {
  const table = tables.find((t) => t.name === name)!;
  return new Set(table.rows.map((row) => JSON.stringify(row)));
}

describe("exportWorkspaceTables", () => {
  it("exports every table of the schema except the auth ones", () => {
    const all = Object.values(schema)
      .filter((value) => is(value, SQLiteTable))
      .map((table) => getTableName(table));
    const exported = exportWorkspaceTables(createTestContext("Alex")).map((t) => t.name);
    expect([...exported, ...NOT_EXPORTED_TABLES].sort()).toEqual(all.sort());
    expect(exported).not.toContain("users");
    expect(exported).not.toContain("accounts");
  });

  it("keeps each workspace's rows to itself (D-25)", async () => {
    const demo = await demoGarage();
    const other = otherGarage();
    const demoTables = exportWorkspaceTables(demo);
    const otherTables = exportWorkspaceTables(other);

    // The demo garage fills every table, so a leak would show below.
    for (const table of demoTables) expect(table.rows.length, table.name).toBeGreaterThan(0);

    for (const table of otherTables) {
      const theirs = rowsOf(demoTables, table.name);
      const mine = rowsOf(otherTables, table.name);
      if (SHARED.includes(table.name)) {
        expect(mine, table.name).toEqual(theirs);
        continue;
      }
      const shared = [...mine].filter((row) => theirs.has(row));
      if (table.name === "rule_templates") {
        // The built-in templates are shared; each workspace's own ones are not.
        const builtIn = table.columns.findIndex((c) => c.name === "workspace_id");
        expect(shared.every((row) => JSON.parse(row)[builtIn] === null)).toBe(true);
        expect([...mine].filter((row) => !theirs.has(row))).toHaveLength(1);
        expect([...theirs].filter((row) => !mine.has(row))).toHaveLength(1);
        continue;
      }
      expect(shared, table.name).toEqual([]);
      const expected = ["inventory_movements", "attachments"].includes(table.name) ? 2 : 1;
      expect(mine.size, table.name).toBe(expected);
    }

    const workspaceIds = (tables: typeof demoTables) =>
      tables.flatMap((table) => {
        const at = table.columns.findIndex((c) => c.name === "workspace_id");
        return at < 0 || table.name === "rule_templates" ? [] : table.rows.map((row) => row[at]);
      });
    expect(new Set(workspaceIds(otherTables))).toEqual(new Set([other.workspace.id]));
    expect(new Set(workspaceIds(demoTables))).toEqual(new Set([demo.workspace.id]));
  });

  it("describes the columns and writes values as stored", () => {
    const ctx = otherGarage();
    const tables = exportWorkspaceTables(ctx);
    const rides = tables.find((t) => t.name === "rides")!;
    const column = (name: string) => rides.columns.find((c) => c.name === name)!;
    expect(column("id")).toMatchObject({ type: "integer", primaryKey: true, nullable: false });
    expect(column("bike_id").references).toEqual({ table: "bikes", column: "id" });
    expect(column("started_at")).toMatchObject({ type: "integer", format: "timestamp_ms" });
    expect(column("lift_assisted").format).toBe("boolean");
    expect(column("ride_type").allowedValues).toContain("commute");
    expect(column("title")).toMatchObject({ allowedValues: null, nullable: true });

    const row = rides.rows[0];
    const value = (name: string) => row[rides.columns.findIndex((c) => c.name === name)];
    expect(value("started_at")).toBe(NOW);
    expect(value("lift_assisted")).toBe(false);
    expect(value("distance_m")).toBe(8000);
    expect(value("title")).toBeNull();

    const links = tables.find((t) => t.name === "inventory_item_bikes")!;
    expect(links.columns.map((c) => [c.name, c.primaryKey])).toEqual([
      ["item_id", true],
      ["bike_id", true],
    ]);
  });
});

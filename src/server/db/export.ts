import "server-only";
import { asc, eq, getTableColumns, getTableName, inArray, isNull, or, type SQL } from "drizzle-orm";
import { getTableConfig, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
import {
  bikes,
  components,
  componentTypes,
  inventoryItemBikes,
  inventoryItems,
  inventoryMovements,
  maintenanceEvents,
  maintenanceItems,
  maintenanceRules,
  purchaseLinks,
  rides,
  ruleTemplates,
  shops,
  tasks,
  workspaces,
} from "./schema";

// The ZIP export (feature 12, D-12, D-50): every table of the current workspace, as stored.
// Auth tables (users, sessions, accounts, verifications, memberships) are never exported.

/** Tables left out of the export: the auth library's and the links between users and workspaces. */
export const NOT_EXPORTED_TABLES = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "memberships",
];

export type ExportColumn = {
  /** SQL name, as in the data dictionary (03). */
  name: string;
  type: "integer" | "text" | "real";
  /** How an integer or text value is to be read. */
  format: "boolean" | "timestamp_ms" | "json" | null;
  nullable: boolean;
  primaryKey: boolean;
  references: { table: string; column: string } | null;
  /** The enum values allowed by the CHECK constraint, or null. */
  allowedValues: readonly string[] | null;
};

export type ExportTable = {
  name: string;
  columns: ExportColumn[];
  /** Values in column order: instants as epoch milliseconds, booleans, JSON as objects. */
  rows: unknown[][];
};

function describeColumns(table: SQLiteTable): { key: string; column: ExportColumn }[] {
  const config = getTableConfig(table);
  const compositeKey = new Set(config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)));
  const references = new Map<string, ExportColumn["references"]>();
  for (const fk of config.foreignKeys) {
    const { columns, foreignColumns, foreignTable } = fk.reference();
    columns.forEach((column, i) =>
      references.set(column.name, {
        table: getTableName(foreignTable),
        column: foreignColumns[i].name,
      }),
    );
  }
  return Object.entries(getTableColumns(table)).map(([key, column]: [string, SQLiteColumn]) => {
    const formats: Record<string, ExportColumn["format"]> = {
      SQLiteBoolean: "boolean",
      SQLiteTimestamp: "timestamp_ms",
      SQLiteTextJson: "json",
    };
    const enumValues = (column as { enumValues?: readonly string[] }).enumValues;
    return {
      key,
      column: {
        name: column.name,
        type: column.getSQLType() as ExportColumn["type"],
        format: formats[column.columnType] ?? null,
        nullable: !column.notNull,
        primaryKey: column.primary || compositeKey.has(column.name),
        references: references.get(column.name) ?? null,
        allowedValues: enumValues && enumValues.length > 0 ? enumValues : null,
      },
    };
  });
}

function exportValue(value: unknown) {
  return value instanceof Date ? value.getTime() : (value ?? null);
}

/**
 * Every exported table with its rows, scoped to the current workspace, read in one transaction
 * so that the tables agree with each other. The shared reference data comes whole (component
 * types, built-in rule templates).
 */
export function exportWorkspaceTables(ctx: AccessContext): ExportTable[] {
  const workspaceId = ctx.workspace.id;
  return getDb().transaction((tx) => {
    const bikeIds = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(eq(bikes.workspaceId, workspaceId));
    const itemIds = tx
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.workspaceId, workspaceId));
    const eventIds = tx
      .select({ id: maintenanceEvents.id })
      .from(maintenanceEvents)
      .where(inArray(maintenanceEvents.bikeId, bikeIds));

    // In the order of the data dictionary (03): each table after the ones it refers to.
    const sources: [SQLiteTable, SQL | undefined][] = [
      [workspaces, eq(workspaces.id, workspaceId)],
      [shops, eq(shops.workspaceId, workspaceId)],
      [bikes, eq(bikes.workspaceId, workspaceId)],
      [componentTypes, undefined],
      [
        ruleTemplates,
        or(isNull(ruleTemplates.workspaceId), eq(ruleTemplates.workspaceId, workspaceId)),
      ],
      [inventoryItems, eq(inventoryItems.workspaceId, workspaceId)],
      [inventoryItemBikes, inArray(inventoryItemBikes.itemId, itemIds)],
      [purchaseLinks, inArray(purchaseLinks.itemId, itemIds)],
      [components, inArray(components.bikeId, bikeIds)],
      [rides, inArray(rides.bikeId, bikeIds)],
      [maintenanceRules, inArray(maintenanceRules.bikeId, bikeIds)],
      [tasks, eq(tasks.workspaceId, workspaceId)],
      [maintenanceEvents, inArray(maintenanceEvents.bikeId, bikeIds)],
      [maintenanceItems, inArray(maintenanceItems.eventId, eventIds)],
      [inventoryMovements, inArray(inventoryMovements.itemId, itemIds)],
    ];

    return sources.map(([table, where]) => {
      const described = describeColumns(table);
      const columns = getTableColumns(table);
      const order = described
        .filter(({ column }) => column.primaryKey)
        .map(({ key }) => asc(columns[key]));
      const rows = tx
        .select()
        .from(table)
        .where(where)
        .orderBy(...order)
        .all() as Record<string, unknown>[];
      return {
        name: getTableName(table),
        columns: described.map(({ column }) => column),
        rows: rows.map((row) => described.map(({ key }) => exportValue(row[key]))),
      };
    });
  });
}

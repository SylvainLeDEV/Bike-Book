import "server-only";
import { z } from "zod";
import { formatItemStock } from "@/lib/display";
import {
  COMPONENT_TYPE_CODES,
  INVENTORY_CATEGORIES,
  INVENTORY_KINDS,
  INVENTORY_UNITS,
  PRODUCT_LEVELS,
} from "@/lib/enums";
import { COMPONENT_TYPE_LABELS, INVENTORY_CATEGORY_LABELS, REBUY_STATE_LABELS } from "@/lib/labels";
import { nameKey } from "@/lib/names";
import type { InventoryItemVM } from "@/lib/view-models";
import { itemInputSchema, newItem } from "@/server/actions/workshop-input";
import {
  addMovement,
  atomically,
  createItem,
  getBike,
  listInventory,
  previewWrite,
  setToolOwned,
  type AccessContext,
} from "@/server/db";
import {
  containersChange,
  levelChange,
  ownedChange,
  stockQuantity,
  type StockChange,
} from "@/server/domain/inventory";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { loadGarage, rebuyRows } from "@/server/views/workshop";
import type { Ids } from "../describe";
import {
  answer,
  defineTool,
  dryRunInput,
  fieldErrorsOf,
  logWrite,
  pageInput,
  paginate,
  refused,
  ToolRefusal,
  type FieldError,
} from "../tool";

// The workshop (feature 8, D-33, D-85) through the MCP (D-92): parts, products and tools with
// their stock computed from movements (D-39), the restocking state, and the same writes as the
// item sheet ("Ajouter un objet") and its stock buttons. Never an archive nor a delete.

export function workshopItemUrl(itemId: number): string {
  return `${getEnv().publicUrl}/workshop?item=${itemId}`;
}

/** The item's stock in the app's terms, by kind. */
function stockOf(item: InventoryItemVM) {
  switch (item.kind) {
    case "part":
      return { quantity: item.quantity, unit: item.unit };
    case "product":
      return { containers: item.containers, level: item.level };
    case "tool":
      return { owned: item.owned };
  }
}

/** A workshop item as the tools answer it: what it is, what it serves, its stock now. */
export function describeItem(item: InventoryItemVM, ids: Ids = "real") {
  const real = ids === "real";
  return {
    id: real ? item.id : null,
    kind: item.kind,
    name: item.name,
    brand: item.brand,
    reference: item.reference,
    category: item.category,
    category_label: INVENTORY_CATEGORY_LABELS[item.category],
    component_type_code: item.componentTypeCode,
    component_type_label: item.componentTypeCode
      ? (COMPONENT_TYPE_LABELS[item.componentTypeCode as keyof typeof COMPONENT_TYPE_LABELS] ??
        null)
      : null,
    bikes:
      item.bikes === "all" ? "all" : item.bikes.map((bike) => ({ id: bike.id, name: bike.name })),
    location: item.location,
    stock: stockOf(item),
    /** In French, as the workshop shows it: "2 paires", "entamé · 2 flacons", "possédé". */
    stock_text: formatItemStock(item),
    low_stock_threshold: item.lowStockThreshold,
    container_label: item.kind === "product" ? (item.containerLabel ?? null) : null,
    /** to_order, ordered, low_stock (a suggestion), or null: nothing to rebuy. */
    rebuy_state: item.state,
    rebuy_label: item.state ? REBUY_STATE_LABELS[item.state] : null,
    last_unit_cost_cents: item.lastUnitCostCents,
    purchase_links: item.purchaseLinks.map((link) => ({
      shop_name: link.shopName,
      url: link.url,
      price_cents: link.priceCents,
    })),
    rules_served: item.rulesServed.map((rule) => ({
      rule_id: rule.ruleId,
      bike_id: rule.bike.id,
      bike_name: rule.bike.name,
      title: rule.title,
      status: rule.status,
      due_on: rule.dueOn,
    })),
    notes: item.notes,
    url: real ? workshopItemUrl(item.id) : null,
  };
}

const servesBike = (item: InventoryItemVM, bikeId: number) =>
  item.bikes === "all" || item.bikes.some((bike) => bike.id === bikeId);

function findItem(ctx: AccessContext, itemId: number): InventoryItemVM | null {
  return loadGarage(ctx).items.find((item) => item.id === itemId) ?? null;
}

// --- list_workshop_items -------------------------------------------------------------------------

const listWorkshopItemsTool = defineTool({
  name: "list_workshop_items",
  title: "Objets de l'atelier",
  kind: "read",
  description:
    "The workshop's parts (units in stock), products (containers, the open one's level) and tools (owned or not), archived ones left out. Each with its stock (stock_text in French), the bikes it serves (\"all\" or a list), its rebuy state (to_order, ordered, low_stock or null), purchase links and the maintenance rules it serves. Filters combine: kind, category, bike_id (items serving that bike), query (name, brand or reference, ignoring case and accents), to_rebuy (only what is to rebuy, most urgent first, with the reason). Read it before add_workshop_item to avoid a duplicate, and to answer whether the owner has a part, product or tool.",
  input: z.strictObject({
    kind: z.enum(INVENTORY_KINDS).optional().describe("part, product or tool."),
    category: z.enum(INVENTORY_CATEGORIES).optional(),
    bike_id: z.number().optional().describe("Only the items that serve this bike (list_bikes)."),
    query: z.string().optional().describe("Words found in the name, brand or reference."),
    to_rebuy: z
      .boolean()
      .optional()
      .describe('true: only "À racheter" (to order, ordered, low stock), most urgent first.'),
    ...pageInput,
  }),
  run: (ctx, { kind, category, bike_id: bikeId, query, to_rebuy: toRebuy, ...page }) => {
    if (bikeId != null && !getBike(ctx, bikeId)) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const garage = loadGarage(ctx);
    const words = query ? nameKey(query) : "";
    let items = garage.items.filter(
      (item) =>
        (kind == null || item.kind === kind) &&
        (category == null || item.category === category) &&
        (bikeId == null || servesBike(item, bikeId)) &&
        (!words ||
          nameKey([item.name, item.brand, item.reference].filter(Boolean).join(" ")).includes(
            words,
          )),
    );
    const reasons = new Map<number, unknown>();
    if (toRebuy) {
      const rows = rebuyRows(items);
      const byId = new Map(items.map((item) => [item.id, item]));
      items = rows.map((row) => byId.get(row.itemId)!);
      for (const row of rows) reasons.set(row.itemId, row.reason);
    } else {
      items = [...items].sort(
        (a, b) =>
          INVENTORY_KINDS.indexOf(a.kind) - INVENTORY_KINDS.indexOf(b.kind) ||
          a.name.localeCompare(b.name, "fr"),
      );
    }
    const { items: slice, next_cursor } = paginate(items, (item) => String(item.id), page);
    return answer(`${slice.length} of ${items.length} workshop items.`, {
      items: slice.map((item) =>
        toRebuy
          ? { ...describeItem(item), rebuy_reason: reasons.get(item.id) }
          : describeItem(item),
      ),
      next_cursor,
      workshop_url: `${getEnv().publicUrl}/workshop`,
    });
  },
});

// --- add_workshop_item ---------------------------------------------------------------------------

/** The fields only one kind has: given for another kind, they are refused, never ignored. */
const KIND_FIELDS = {
  part: ["quantity", "unit", "low_stock_threshold"],
  product: ["containers", "level", "container_label"],
  tool: ["owned"],
} as const;

const RENAME = {
  bikes: "bike_ids",
  shopName: "link.shop_name",
  priceCents: "link.price_cents",
};

const addWorkshopItemTool = defineTool({
  name: "add_workshop_item",
  title: "Ajouter un objet à l'atelier",
  kind: "write",
  description:
    'Adds a part, a product or a tool to the workshop, as "Ajouter un objet" does, with its first stock. A part: quantity (units, default 0), unit (piece, pair or set; default piece), low_stock_threshold. A product (oil, grease, sealant…): containers in stock, the open one included (default 1), level of the open one (full, started, low; default full), container_label in French ("flacon", "bidon"…). A tool: owned (default true; false puts it on "À commander"). component_type_code ties a part or product to a part type (list_component_types), so it serves that type\'s rules and procedures. Not in the workshop: the parts fitted to a bike (add_component). Read list_workshop_items first: an item of the same name is warned about. Call with dry_run true first.',
  input: z.strictObject({
    kind: z.enum(INVENTORY_KINDS).describe("part, product or tool."),
    name: z
      .string()
      .describe(
        'In French, as the owner reads it: "Plaquettes Shimano J04C", "Huile Fox 20WT Gold", "Clé dynamométrique".',
      ),
    brand: z.string().nullable().optional(),
    reference: z.string().nullable().optional().describe("Manufacturer part number or SKU."),
    category: z
      .enum(INVENTORY_CATEGORIES)
      .describe(
        "suspension, drivetrain, brakes, wheels, cockpit, frame, electric, other (général), or care (cleaning, lubrication).",
      ),
    component_type_code: z
      .enum(COMPONENT_TYPE_CODES)
      .nullable()
      .optional()
      .describe("The part type it is for (brake_pads, chain, tire…), or null."),
    bike_ids: z
      .array(z.number())
      .optional()
      .describe(
        "The bikes it serves (list_bikes). Omitted: all bikes, so it serves every bike's rules and procedures.",
      ),
    location: z.string().nullable().optional().describe('Where it is kept: "Étagère du haut".'),
    notes: z.string().nullable().optional(),
    link: z
      .strictObject({
        shop_name: z.string().nullable().optional(),
        url: z.string().nullable().optional().describe("https:// page where it is sold."),
        price_cents: z.number().nullable().optional().describe("Price noted today, euro cents."),
      })
      .optional()
      .describe("Where to buy it again."),
    quantity: z.number().optional().describe("Part: units in stock (integer ≥ 0)."),
    unit: z.enum(INVENTORY_UNITS).optional().describe("Part: piece, pair or set."),
    low_stock_threshold: z
      .number()
      .nullable()
      .optional()
      .describe("Part: low stock at or below this many units."),
    containers: z
      .number()
      .optional()
      .describe("Product: containers in stock, the open one included (integer ≥ 0)."),
    level: z
      .enum(["full", "started", "low"])
      .optional()
      .describe("Product: the open container's level."),
    container_label: z.string().nullable().optional().describe('Product: "flacon", "bidon"…'),
    owned: z.boolean().optional().describe("Tool: whether the owner has it."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { dry_run: dryRun, ...args }) => {
    const misplaced: FieldError[] = INVENTORY_KINDS.filter((kind) => kind !== args.kind).flatMap(
      (kind) =>
        KIND_FIELDS[kind]
          .filter((field) => args[field] !== undefined)
          .map((field) => ({
            field,
            message: "Ce champ ne concerne pas ce type d'objet.",
          })),
    );
    if (misplaced.length) return refused(misplaced, "The item was refused; nothing was written.");

    const common = {
      name: args.name,
      brand: args.brand ?? null,
      reference: args.reference ?? null,
      category: args.category,
      componentTypeCode: args.component_type_code ?? null,
      bikes: args.bike_ids ?? ("all" as const),
      location: args.location ?? null,
      link: args.link
        ? {
            shopName: args.link.shop_name ?? null,
            url: args.link.url ?? null,
            priceCents: args.link.price_cents ?? null,
          }
        : null,
      notes: args.notes ?? null,
    };
    const input =
      args.kind === "part"
        ? {
            ...common,
            kind: args.kind,
            quantity: args.quantity ?? 0,
            unit: args.unit ?? "piece",
            lowStockThreshold: args.low_stock_threshold ?? null,
          }
        : args.kind === "product"
          ? {
              ...common,
              kind: args.kind,
              containers: args.containers ?? 1,
              level: args.level ?? "full",
              containerLabel: args.container_label ?? null,
            }
          : { ...common, kind: args.kind, owned: args.owned ?? true };
    const parsed = itemInputSchema.safeParse(input);
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", RENAME),
        "The item was refused; nothing was written.",
      );
    }
    const key = nameKey(parsed.data.name);
    const namesakes = listInventory(ctx).filter((item) => nameKey(item.name) === key);
    const ids: Ids = dryRun ? "none" : "real";

    const write = () => {
      const outcome = createItem(ctx, newItem(parsed.data, Date.now(), today()));
      if (!outcome.ok) {
        throw new ToolRefusal(
          [{ field: "bike_ids", message: "Vélo introuvable." }],
          "The item was refused; nothing was written.",
        );
      }
      return { itemId: outcome.itemId, item: describeItem(findItem(ctx, outcome.itemId)!, ids) };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "add_workshop_item", { item_id: result.itemId });
    return answer(
      dryRun
        ? `Dry run: would add ${parsed.data.kind} "${result.item.name}" (${result.item.stock_text}) to the workshop. Nothing was written.`
        : `Added ${parsed.data.kind} "${result.item.name}" (item ${result.itemId}) to the workshop.`,
      {
        dry_run: dryRun,
        item: result.item,
        warnings: namesakes.map(
          (item) =>
            `The workshop already has an item named "${item.name}" (id ${item.id}, ${item.kind}${item.archivedAt != null ? ", archived" : ""}): to change its stock, use update_stock on it rather than adding a second one.`,
        ),
      },
    );
  },
});

// --- update_stock ---------------------------------------------------------------------------------

const ACTION_FIELDS = {
  purchase: ["quantity", "unit_price_cents"],
  use: ["quantity"],
  count: ["counted"],
  level: ["level"],
  owned: ["owned"],
} as const;

type StockAction = keyof typeof ACTION_FIELDS;

const TOOL_MESSAGE = "Un outil se note possédé ou non : action owned.";

/** The movement an action writes, as the workshop's buttons do; a refusal names the field. */
function changeFor(
  item: InventoryItemVM,
  args: {
    action: StockAction;
    quantity?: number;
    counted?: number;
    level?: (typeof PRODUCT_LEVELS)[number];
    owned?: boolean;
  },
): StockChange | null {
  const refuse = (field: string, message: string): never => {
    throw new ToolRefusal(
      [{ field, message }],
      "The stock change was refused; nothing was written.",
    );
  };
  const current =
    item.kind === "part" ? item.quantity : item.kind === "product" ? item.containers : 0;
  switch (args.action) {
    case "purchase":
    case "use": {
      if (item.kind === "tool") return refuse("action", TOOL_MESSAGE);
      const quantity = args.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
        return refuse("quantity", "Un nombre entier entre 1 et 10 000.");
      }
      const delta = args.action === "use" ? -quantity : quantity;
      if (current + delta < 0) {
        return refuse("quantity", `Stock insuffisant : ${formatItemStock(item)} en stock.`);
      }
      return item.kind === "part"
        ? { kind: args.action, quantityDelta: delta, levelAfter: null }
        : containersChange(current, delta, args.action);
    }
    case "count": {
      if (item.kind === "tool") return refuse("action", TOOL_MESSAGE);
      if (args.counted == null) return refuse("counted", "Indique la quantité comptée.");
      if (!Number.isInteger(args.counted) || args.counted < 0 || args.counted > 10_000) {
        return refuse("counted", "Un nombre entier entre 0 et 10 000.");
      }
      const delta = args.counted - current;
      if (delta === 0) return null;
      return item.kind === "part"
        ? { kind: "adjustment", quantityDelta: delta, levelAfter: null }
        : containersChange(current, delta, "adjustment");
    }
    case "level": {
      if (item.kind !== "product") return refuse("action", "Seul un produit a un niveau.");
      if (args.level == null) return refuse("level", "Indique le niveau.");
      if (item.containers < 1) {
        return refuse("level", "Il n'en reste plus : ajoute d'abord un contenant (purchase).");
      }
      return levelChange({ containers: item.containers, level: item.level }, args.level);
    }
    case "owned": {
      if (item.kind !== "tool") return refuse("action", "Seul un outil se note possédé ou non.");
      if (args.owned == null) return refuse("owned", "Indique si l'outil est possédé.");
      return ownedChange(stockQuantity(item.movements), args.owned);
    }
  }
}

const updateStockTool = defineTool({
  name: "update_stock",
  title: "Mettre à jour un stock",
  kind: "write",
  description:
    "Changes a workshop item's stock as its buttons do, one movement in its history (never a stored total). action: purchase (quantity units or containers bought, default 1, unit_price_cents optional: the cost of a part later taken from stock), use (quantity used, default 1), count (counted: what the owner counted, the difference becomes a correction), level (product only: the open container's level, full, started, low, or empty: it is finished and the next one opened), owned (tool only: true or false; true also ends its restocking). Parts and products only for purchase, use and count. Call with dry_run true first.",
  input: z.strictObject({
    item_id: z.number().describe("The workshop item (list_workshop_items)."),
    action: z.enum(["purchase", "use", "count", "level", "owned"]),
    quantity: z.number().optional().describe("purchase or use: units or containers (default 1)."),
    unit_price_cents: z
      .number()
      .nullable()
      .optional()
      .describe("purchase: price of one unit or container, euro cents."),
    counted: z.number().optional().describe("count: units or containers counted (integer ≥ 0)."),
    level: z.enum(PRODUCT_LEVELS).optional().describe("level: full, started, low or empty."),
    owned: z.boolean().optional().describe("owned: whether the owner has the tool."),
    note: z.string().nullable().optional().describe("A short note kept on the movement."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { item_id: itemId, dry_run: dryRun, note, ...args }) => {
    const misplaced = (
      ["quantity", "unit_price_cents", "counted", "level", "owned"] as const
    ).filter(
      (field) =>
        args[field] !== undefined &&
        !(ACTION_FIELDS[args.action] as readonly string[]).includes(field),
    );
    if (misplaced.length) {
      return refused(
        misplaced.map((field) => ({ field, message: "Ce champ ne sert pas pour cette action." })),
        "The stock change was refused; nothing was written.",
      );
    }
    const price = args.unit_price_cents ?? null;
    if (price != null && (!Number.isInteger(price) || price < 0 || price > 100_000_000)) {
      return refused(
        [{ field: "unit_price_cents", message: "Prix invalide : en centimes, entier positif." }],
        "The stock change was refused; nothing was written.",
      );
    }
    const cleanNote = note?.trim().slice(0, 500) || null;
    const item = findItem(ctx, itemId);
    if (!item)
      return refused([{ field: "item_id", message: "Objet introuvable." }], "Unknown item.");
    const change = changeFor(item, args);
    const before = formatItemStock(item);
    if (!change) {
      return answer(`Nothing to change: ${item.name} is already ${before}.`, {
        dry_run: dryRun,
        changed: false,
        item: describeItem(item),
        warnings: [],
      });
    }

    const write = () => {
      const at = Date.now();
      const outcome =
        args.action === "owned"
          ? setToolOwned(ctx, item.id, { quantityDelta: change.quantityDelta, at })
          : addMovement(ctx, item.id, {
              kind: change.kind,
              quantityDelta: change.quantityDelta,
              levelAfter: change.levelAfter,
              unitCostCents: args.action === "purchase" ? price : null,
              note: cleanNote ?? (args.action === "count" ? "Corrigé après un comptage" : null),
              at,
            });
      if (!outcome.ok) {
        throw new ToolRefusal([{ field: "item_id", message: "Objet introuvable." }]);
      }
      return { movementId: outcome.movementId, item: describeItem(findItem(ctx, item.id)!) };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "update_stock", { item_id: item.id, movement_id: result.movementId });
    }
    const summary = `${item.name}: ${before} → ${result.item.stock_text}`;
    return answer(dryRun ? `Dry run: ${summary}. Nothing was written.` : `${summary}.`, {
      dry_run: dryRun,
      changed: true,
      stock_before: before,
      item: result.item,
      warnings:
        result.item.rebuy_state === "low_stock" && item.state !== "low_stock"
          ? ["The item reaches its low stock: the workshop now suggests rebuying it."]
          : [],
    });
  },
});

export const workshopTools = [listWorkshopItemsTool, addWorkshopItemTool, updateStockTool];

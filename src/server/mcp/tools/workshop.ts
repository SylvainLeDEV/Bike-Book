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
import type { InventoryItemVM, RebuyRowVM } from "@/lib/view-models";
import {
  itemData,
  itemInputSchema,
  newItem,
  pageUrl,
  priceCents,
} from "@/server/actions/workshop-input";
import {
  addMovement,
  addPurchaseLink,
  atomically,
  createItem,
  getBike,
  listInventory,
  previewWrite,
  receiveItem,
  setItemArchived,
  setRestock,
  setToolOwned,
  updateItem,
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
import { archivedItems, loadGarage, rebuyRows } from "@/server/views/workshop";
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
// item sheet ("Ajouter un objet") and its stock buttons. Archived (D-95), never deleted.

const workshopUrl = () => `${getEnv().publicUrl}/workshop`;

export function workshopItemUrl(itemId: number): string {
  return `${workshopUrl()}?item=${itemId}`;
}

/**
 * Why an item is in "À racheter" (D-41), in snake_case (D-100): a rule late or due soon needs it;
 * marked to order (a tool not owned, an item put on the list; at its cheapest link's price);
 * ordered; or at its low-stock threshold.
 */
function rebuyReasonOf(reason: RebuyRowVM["reason"]) {
  switch (reason.kind) {
    case "rule":
      return { kind: "rule", status: reason.status, needed_on: reason.neededOn };
    case "ordered":
      return {
        kind: "ordered",
        ordered_on: reason.orderedOn || null,
        price_cents: reason.priceCents,
      };
    case "low_stock":
      return { kind: "low_stock" };
    case "price":
      return { kind: "to_order", price_cents: reason.priceCents };
  }
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
    "The workshop's parts (units in stock), products (containers, the open one's level) and tools (owned or not), archived ones left out unless include_archived (then archived true; they serve no rule). Each with its stock (stock_text in French), the bikes it serves (\"all\" or a list), its rebuy state (to_order, ordered, low_stock or null), purchase links and the maintenance rules it serves. Filters combine: kind, category, bike_id (items serving that bike), query (name, brand or reference, ignoring case and accents), to_rebuy (only what is to rebuy, most urgent first, never archived ones, with rebuy_reason: kind rule (status, needed_on: a late or due-soon rule needs it), to_order (price_cents: its cheapest link), ordered (ordered_on, price_cents) or low_stock). Read it before add_workshop_item to avoid a duplicate (with include_archived: an archived one comes back with archive_workshop_item archived false), and to answer whether the owner has a part, product or tool.",
  input: z.strictObject({
    kind: z.enum(INVENTORY_KINDS).optional().describe("part, product or tool."),
    category: z.enum(INVENTORY_CATEGORIES).optional(),
    bike_id: z.number().optional().describe("Only the items that serve this bike (list_bikes)."),
    query: z.string().optional().describe("Words found in the name, brand or reference."),
    to_rebuy: z
      .boolean()
      .optional()
      .describe('true: only "À racheter" (to order, ordered, low stock), most urgent first.'),
    include_archived: z
      .boolean()
      .optional()
      .describe("true: the archived items too, after the others (default false)."),
    ...pageInput,
  }),
  run: (
    ctx,
    {
      kind,
      category,
      bike_id: bikeId,
      query,
      to_rebuy: toRebuy,
      include_archived: withArchived,
      ...page
    },
  ) => {
    if (bikeId != null && !getBike(ctx, bikeId)) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const garage = loadGarage(ctx);
    const archived = withArchived && !toRebuy ? archivedItems(ctx, garage) : [];
    const archivedIds = new Set(archived.map((item) => item.id));
    const words = query ? nameKey(query) : "";
    let items = [...garage.items, ...archived].filter(
      (item) =>
        (kind == null || item.kind === kind) &&
        (category == null || item.category === category) &&
        (bikeId == null || servesBike(item, bikeId)) &&
        (!words ||
          nameKey([item.name, item.brand, item.reference].filter(Boolean).join(" ")).includes(
            words,
          )),
    );
    const reasons = new Map<number, ReturnType<typeof rebuyReasonOf>>();
    if (toRebuy) {
      const rows = rebuyRows(items);
      const byId = new Map(items.map((item) => [item.id, item]));
      items = rows.map((row) => byId.get(row.itemId)!);
      for (const row of rows) reasons.set(row.itemId, rebuyReasonOf(row.reason));
    } else {
      items = [...items].sort(
        (a, b) =>
          Number(archivedIds.has(a.id)) - Number(archivedIds.has(b.id)) ||
          INVENTORY_KINDS.indexOf(a.kind) - INVENTORY_KINDS.indexOf(b.kind) ||
          a.name.localeCompare(b.name, "fr"),
      );
    }
    const { items: slice, next_cursor } = paginate(items, (item) => String(item.id), page);
    return answer(`${slice.length} of ${items.length} workshop items.`, {
      items: slice.map((item) => ({
        ...describeItem(item),
        archived: archivedIds.has(item.id),
        ...(toRebuy ? { rebuy_reason: reasons.get(item.id) } : {}),
      })),
      next_cursor,
      workshop_url: workshopUrl(),
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

// --- update_workshop_item ------------------------------------------------------------------------

const STOCK_FIELDS = ["quantity", "containers", "level", "owned"] as const;

const updateWorkshopItemTool = defineTool({
  name: "update_workshop_item",
  title: "Modifier un objet de l'atelier",
  kind: "write",
  description:
    'Changes a workshop item\'s description, as "Modifier l\'objet": only the fields given change; null clears a text. Its kind never changes, and its stock is changed with update_stock, never here. bike_ids: "all" or a list of bikes. add_link adds a purchase link (a shop, an https page, a price noted today). Call with dry_run true first.',
  input: z.strictObject({
    item_id: z.number().describe("The workshop item (list_workshop_items)."),
    name: z.string().optional(),
    brand: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
    category: z.enum(INVENTORY_CATEGORIES).optional(),
    component_type_code: z.enum(COMPONENT_TYPE_CODES).nullable().optional(),
    bike_ids: z
      .union([z.literal("all"), z.array(z.number())])
      .optional()
      .describe('"all", or the bikes it serves.'),
    location: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    unit: z.enum(INVENTORY_UNITS).optional().describe("Part only."),
    low_stock_threshold: z.number().nullable().optional().describe("Part only."),
    container_label: z.string().nullable().optional().describe("Product only."),
    add_link: z
      .strictObject({
        shop_name: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        price_cents: z.number().nullable().optional(),
      })
      .optional(),
    // Refused with a pointer to update_stock rather than rejected as unknown.
    quantity: z.unknown().optional(),
    containers: z.unknown().optional(),
    level: z.unknown().optional(),
    owned: z.unknown().optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, { item_id: itemId, dry_run: dryRun, add_link: link, ...args }) => {
    const REFUSED = "The item was refused; nothing was written.";
    const item = findItem(ctx, itemId);
    if (!item)
      return refused([{ field: "item_id", message: "Objet introuvable." }], "Unknown item.");
    const errors: FieldError[] = [
      ...STOCK_FIELDS.filter((field) => args[field] !== undefined).map((field) => ({
        field,
        message: "Le stock se change avec update_stock.",
      })),
      ...(["unit", "low_stock_threshold", "container_label"] as const)
        .filter(
          (field) =>
            args[field] !== undefined &&
            !(KIND_FIELDS[item.kind] as readonly string[]).includes(field),
        )
        .map((field) => ({ field, message: "Ce champ ne concerne pas ce type d'objet." })),
    ];
    if (errors.length) return refused(errors, REFUSED);

    const pick = <T>(value: T | undefined, base: T) => (value === undefined ? base : value);
    const common = {
      name: args.name ?? item.name,
      brand: pick(args.brand, item.brand),
      reference: pick(args.reference, item.reference),
      category: args.category ?? item.category,
      componentTypeCode: pick(args.component_type_code, item.componentTypeCode),
      bikes:
        args.bike_ids ?? (item.bikes === "all" ? ("all" as const) : item.bikes.map((b) => b.id)),
      location: pick(args.location, item.location),
      link: null,
      notes: pick(args.notes, item.notes),
    };
    const input =
      item.kind === "part"
        ? {
            ...common,
            kind: item.kind,
            quantity: Math.max(0, item.quantity),
            unit: args.unit ?? item.unit,
            lowStockThreshold: pick(args.low_stock_threshold, item.lowStockThreshold),
          }
        : item.kind === "product"
          ? {
              ...common,
              kind: item.kind,
              containers: item.containers,
              level: item.level === "empty" ? ("full" as const) : item.level,
              containerLabel: pick(args.container_label, item.containerLabel ?? null),
            }
          : { ...common, kind: item.kind, owned: item.owned };
    const parsed = itemInputSchema.safeParse(input);
    if (!parsed.success) return refused(fieldErrorsOf(parsed.error.issues, "", RENAME), REFUSED);

    const linkInput = link
      ? z
          .object({
            shopName: z
              .string()
              .trim()
              .max(100, "100 caractères au maximum.")
              .nullable()
              .transform((value) => value || null),
            url: pageUrl,
            priceCents,
          })
          .refine((l) => l.shopName || l.url, {
            error: "Indique la boutique ou l'adresse de la page.",
          })
          .safeParse({
            shopName: link.shop_name ?? null,
            url: link.url ?? null,
            priceCents: link.price_cents ?? null,
          })
      : null;
    if (linkInput && !linkInput.success) {
      return refused(fieldErrorsOf(linkInput.error.issues, "add_link"), REFUSED);
    }

    const write = () => {
      if (!updateItem(ctx, item.id, itemData(parsed.data)).ok) {
        throw new ToolRefusal([{ field: "bike_ids", message: "Vélo introuvable." }], REFUSED);
      }
      if (linkInput?.success) {
        const l = linkInput.data;
        addPurchaseLink(ctx, item.id, {
          shop: l.shopName ? { name: l.shopName, kind: l.url ? "online" : "physical" } : null,
          url: l.url,
          priceCents: l.priceCents,
          notedOn: today(),
        });
      }
      return describeItem(findItem(ctx, item.id)!);
    };
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_workshop_item", { item_id: item.id });
    return answer(
      dryRun
        ? `Dry run: would change "${after.name}". Nothing was written.`
        : `Changed "${after.name}" (item ${item.id}).`,
      { dry_run: dryRun, item: after, before: describeItem(item), warnings: [] },
    );
  },
});

// --- set_restock and receive_item ----------------------------------------------------------------

const OWNED_TOOL = "Tu as déjà cet outil : note d'abord « Je ne l'ai pas » (update_stock, owned).";

const setRestockTool = defineTool({
  name: "set_restock",
  title: "À commander",
  kind: "write",
  description:
    'Moves a workshop item along its restocking, as the workshop\'s buttons: to_order ("À commander": on the list to buy), ordered ("En commande"), or none (cancelled). quantity: units or containers wanted (default: the one noted, else 1; a tool: 1). What arrives is receive_item. list_workshop_items with to_rebuy gives the list. Call with dry_run true first.',
  input: z.strictObject({
    item_id: z.number().describe("The workshop item (list_workshop_items)."),
    status: z.enum(["to_order", "ordered", "none"]),
    quantity: z.number().optional().describe("Units or containers wanted (integer ≥ 1)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { item_id: itemId, status, quantity, dry_run: dryRun }) => {
    const REFUSED = "The restocking was refused; nothing was written.";
    const item = findItem(ctx, itemId);
    if (!item)
      return refused([{ field: "item_id", message: "Objet introuvable." }], "Unknown item.");
    if (item.kind === "tool" && item.owned && status !== "none") {
      return refused([{ field: "item_id", message: OWNED_TOOL }], REFUSED);
    }
    const wanted = item.kind === "tool" ? 1 : (quantity ?? item.restock.quantity ?? 1);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > 10_000) {
      return refused([{ field: "quantity", message: "Quantité invalide." }], REFUSED);
    }
    const write = () => {
      const outcome = setRestock(ctx, item.id, {
        status,
        quantity: status === "none" ? null : wanted,
        changedOn: status === "none" ? null : today(),
      });
      if (!outcome.ok) throw new ToolRefusal([{ field: "item_id", message: "Objet introuvable." }]);
      return describeItem(findItem(ctx, item.id)!);
    };
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "set_restock", { item_id: item.id });
    const label = { to_order: "to order", ordered: "ordered", none: "no longer to rebuy" }[status];
    return answer(
      dryRun
        ? `Dry run: "${item.name}" would be ${label}. Nothing was written.`
        : `"${item.name}" is ${label}.`,
      {
        dry_run: dryRun,
        item: after,
        restock_quantity: status === "none" ? null : wanted,
        warnings: [],
      },
    );
  },
});

const receiveItemTool = defineTool({
  name: "receive_item",
  title: "Reçu",
  kind: "write",
  description:
    "Records what arrived, as the workshop's \"Reçu\": a purchase of quantity (default: the quantity ordered, else 1; a tool: 1) at unit_price_cents (default: the cheapest link's price, when known), and the restocking ends. Works whether or not it was marked to order. Call with dry_run true first.",
  input: z.strictObject({
    item_id: z.number().describe("The workshop item (list_workshop_items)."),
    quantity: z.number().optional().describe("Units or containers received (integer ≥ 1)."),
    unit_price_cents: z
      .number()
      .nullable()
      .optional()
      .describe("Price of one unit or container, euro cents."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { item_id: itemId, quantity, unit_price_cents: price, dry_run: dryRun }) => {
    const REFUSED = "The reception was refused; nothing was written.";
    const item = findItem(ctx, itemId);
    if (!item)
      return refused([{ field: "item_id", message: "Objet introuvable." }], "Unknown item.");
    if (item.kind === "tool" && item.owned) {
      return refused([{ field: "item_id", message: OWNED_TOOL }], REFUSED);
    }
    const wanted = item.kind === "tool" ? 1 : (quantity ?? item.restock.quantity ?? 1);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > 10_000) {
      return refused([{ field: "quantity", message: "Quantité invalide." }], REFUSED);
    }
    if (price != null && (!Number.isInteger(price) || price < 0 || price > 100_000_000)) {
      return refused(
        [{ field: "unit_price_cents", message: "Prix invalide : en centimes, entier positif." }],
        REFUSED,
      );
    }
    // The price of the cheapest link, when one is known, as the app does.
    const link = item.purchaseLinks
      .filter((l) => l.priceCents != null)
      .sort((a, b) => a.priceCents! - b.priceCents!)[0];
    const change =
      item.kind === "product"
        ? containersChange(item.containers, wanted, "purchase")
        : ({ kind: "purchase", quantityDelta: wanted, levelAfter: null } as const);
    if (!change) return refused([{ field: "quantity", message: "Quantité invalide." }], REFUSED);
    const before = formatItemStock(item);
    const write = () => {
      const outcome = receiveItem(ctx, item.id, {
        quantity: wanted,
        levelAfter: change.levelAfter,
        unitCostCents: price === undefined ? (link?.priceCents ?? null) : price,
        purchaseLinkId: price === undefined ? (link?.id ?? null) : null,
        at: Date.now(),
      });
      if (!outcome.ok) throw new ToolRefusal([{ field: "item_id", message: "Objet introuvable." }]);
      return { movementId: outcome.movementId, item: describeItem(findItem(ctx, item.id)!) };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "receive_item", { item_id: item.id, movement_id: result.movementId });
    }
    const summary = `${item.name}: ${before} → ${result.item.stock_text}`;
    return answer(dryRun ? `Dry run: ${summary}. Nothing was written.` : `${summary}.`, {
      dry_run: dryRun,
      stock_before: before,
      item: result.item,
      warnings: [],
    });
  },
});

// --- archive_workshop_item -----------------------------------------------------------------------

const archiveWorkshopItemTool = defineTool({
  name: "archive_workshop_item",
  title: "Archiver un objet de l'atelier",
  kind: "write",
  description:
    "Archives a workshop item, as \"Archiver\": it leaves the workshop's lists, rebuying and procedures' material; its history stays (never deleted), and the parts fitted from it keep their link. archived false brings it back (list_workshop_items include_archived finds it). url: the item's page once back in the workshop; the workshop's page while archived (the app shows no archived item). Call with dry_run true first.",
  input: z.strictObject({
    item_id: z.number().describe("The workshop item (list_workshop_items)."),
    archived: z.boolean().optional().describe("true (default): archive; false: bring it back."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { item_id: itemId, archived = true, dry_run: dryRun }) => {
    const item = listInventory(ctx).find((i) => i.id === itemId);
    if (!item)
      return refused([{ field: "item_id", message: "Objet introuvable." }], "Unknown item.");
    // The item's page while it is in the workshop; archived, the app has no page for it.
    const url = archived ? workshopUrl() : workshopItemUrl(item.id);
    if ((item.archivedAt != null) === archived) {
      return answer(
        `Nothing to change: "${item.name}" is already ${archived ? "archived" : "in the workshop"}.`,
        {
          dry_run: dryRun,
          changed: false,
          item: { id: item.id, name: item.name, archived },
          warnings: [],
          url,
        },
      );
    }
    const write = () => {
      if (!setItemArchived(ctx, item.id, archived ? Date.now() : null).ok) {
        throw new ToolRefusal([{ field: "item_id", message: "Objet introuvable." }]);
      }
    };
    if (dryRun) previewWrite(write);
    else {
      atomically(write);
      logWrite(ctx, "archive_workshop_item", { item_id: item.id });
    }
    const what = archived ? "archived" : "back in the workshop";
    return answer(
      dryRun
        ? `Dry run: "${item.name}" would be ${what}. Nothing was written.`
        : `"${item.name}" is ${what}.`,
      {
        dry_run: dryRun,
        changed: true,
        item: { id: item.id, name: item.name, archived },
        warnings: [],
        url,
      },
    );
  },
});

export const workshopTools = [
  listWorkshopItemsTool,
  addWorkshopItemTool,
  updateWorkshopItemTool,
  updateStockTool,
  setRestockTool,
  receiveItemTool,
  archiveWorkshopItemTool,
];

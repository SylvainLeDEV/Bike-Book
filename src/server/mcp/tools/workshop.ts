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
import { isLocalDate } from "@/lib/format";
import { COMPONENT_TYPE_LABELS, INVENTORY_CATEGORY_LABELS, REBUY_STATE_LABELS } from "@/lib/labels";
import { cleanName, nameKey } from "@/lib/names";
import type {
  HistoryItemVM,
  InventoryItemVM,
  RebuyRowVM,
  WorkshopHistoryEntryVM,
} from "@/lib/view-models";
import { defaultPurchaseLink, movementSummary, spendingOf } from "@/lib/workshop-history";
import {
  itemData,
  itemInputSchema,
  itemOpening,
  newItem,
  purchaseLinkSchema,
  toPurchaseLink,
} from "@/server/actions/workshop-input";
import {
  addMovement,
  addPurchaseLink,
  atomically,
  createItem,
  deletePurchaseLink,
  getBike,
  listInventory,
  previewWrite,
  receiveItem,
  setItemArchived,
  setRestock,
  setToolOwned,
  updateItem,
  updateMovement,
  updatePurchaseLink,
  type AccessContext,
  type PurchaseSource,
} from "@/server/db";
import {
  containersChange,
  levelChange,
  ownedChange,
  stockQuantity,
  type StockChange,
} from "@/server/domain/inventory";
import { eventInstant } from "@/server/domain/time";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { archivedItems, loadGarage, rebuyRows, workshopHistory } from "@/server/views/workshop";
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
    /** The latest purchase by its day (D-111): list_workshop_history gives them all. */
    last_purchase: item.lastPurchase
      ? {
          on: item.lastPurchase.on,
          unit_price_cents: item.lastPurchase.unitCostCents,
          shop_name: item.lastPurchase.shopName,
        }
      : null,
    /** link_id: update_workshop_item's update_link and remove_link (D-106). */
    purchase_links: item.purchaseLinks.map((link) => ({
      link_id: link.id,
      shop_name: link.shopName,
      url: link.url,
      price_cents: link.priceCents,
      price_noted_on: link.priceNotedOn,
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
    purchased_on: z
      .string()
      .nullable()
      .optional()
      .describe(
        "YYYY-MM-DD, today or before: the stock given was bought that day, at link.price_cents and through the link (a purchase in the workshop's history); omitted: an addition today.",
      ),
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
      purchasedOn: args.purchased_on ?? null,
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
        warnings: [
          ...namesakes.map(
            (item) =>
              `The workshop already has an item named "${item.name}" (id ${item.id}, ${item.kind}${item.archivedAt != null ? ", archived" : ""}): to change its stock, use update_stock on it rather than adding a second one.`,
          ),
          ...(parsed.data.purchasedOn && itemOpening(parsed.data).initialQuantity === 0
            ? ["purchased_on was ignored: the item starts with no stock, so nothing was bought."]
            : []),
        ],
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
    'Changes a workshop item\'s description, as "Modifier l\'objet": only the fields given change; null clears a text. Its kind never changes, and its stock is changed with update_stock, never here. bike_ids: "all" or a list of bikes. Purchase links (a shop or an https page, a price noted today): add_link adds one, or gives its new price to the link already on that page (or that shop without a page); update_link changes one (link_id from purchase_links; only the fields given change, null clears); remove_link deletes one (purchases made through it keep their price). Call with dry_run true first.',
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
    update_link: z
      .strictObject({
        link_id: z.number().describe("purchase_links[].link_id of this item."),
        shop_name: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        price_cents: z.number().nullable().optional(),
      })
      .optional(),
    remove_link: z.number().optional().describe("purchase_links[].link_id of this item."),
    // Refused with a pointer to update_stock rather than rejected as unknown.
    quantity: z.unknown().optional(),
    containers: z.unknown().optional(),
    level: z.unknown().optional(),
    owned: z.unknown().optional(),
    dry_run: dryRunInput,
  }),
  run: (
    ctx,
    {
      item_id: itemId,
      dry_run: dryRun,
      add_link: link,
      update_link: change,
      remove_link: removeId,
      ...args
    },
  ) => {
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
      ? purchaseLinkSchema.safeParse({
          shopName: link.shop_name ?? null,
          url: link.url ?? null,
          priceCents: link.price_cents ?? null,
        })
      : null;
    if (linkInput && !linkInput.success) {
      return refused(fieldErrorsOf(linkInput.error.issues, "add_link"), REFUSED);
    }
    const linkOf = (linkId: number) => item.purchaseLinks.find((l) => l.id === linkId);
    const edited = change ? linkOf(change.link_id) : undefined;
    if (change && !edited) {
      return refused(
        [{ field: "update_link.link_id", message: "Lien d'achat introuvable." }],
        REFUSED,
      );
    }
    if (removeId !== undefined && !linkOf(removeId)) {
      return refused([{ field: "remove_link", message: "Lien d'achat introuvable." }], REFUSED);
    }
    const changeInput =
      change && edited
        ? purchaseLinkSchema.safeParse({
            shopName: change.shop_name === undefined ? edited.shop : change.shop_name,
            url: change.url === undefined ? edited.url : change.url,
            priceCents: change.price_cents === undefined ? edited.priceCents : change.price_cents,
          })
        : null;
    if (changeInput && !changeInput.success) {
      return refused(fieldErrorsOf(changeInput.error.issues, "update_link"), REFUSED);
    }

    const warnings: string[] = [];
    const write = () => {
      if (!updateItem(ctx, item.id, itemData(parsed.data)).ok) {
        throw new ToolRefusal([{ field: "bike_ids", message: "Vélo introuvable." }], REFUSED);
      }
      if (removeId !== undefined) deletePurchaseLink(ctx, removeId);
      if (changeInput?.success) {
        updatePurchaseLink(ctx, change!.link_id, toPurchaseLink(changeInput.data, today()));
      }
      if (linkInput?.success) {
        const added = addPurchaseLink(ctx, item.id, toPurchaseLink(linkInput.data, today()));
        if (added.ok && added.updated) {
          warnings.push(
            `add_link: this page (or shop) was already linked; link ${added.linkId} took the new price instead of a second link.`,
          );
        }
      }
      return describeItem(findItem(ctx, item.id)!);
    };
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_workshop_item", { item_id: item.id });
    return answer(
      dryRun
        ? `Dry run: would change "${after.name}". Nothing was written.`
        : `Changed "${after.name}" (item ${item.id}).`,
      { dry_run: dryRun, item: after, before: describeItem(item), warnings },
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
    "Records what arrived, as the workshop's \"Reçu\": a purchase of quantity (default: the quantity ordered, else 1; a tool: 1) on received_on (default today; a past day puts it at its date in the workshop's history), at unit_price_cents, bought through link_id (one of the item's purchase_links) or at shop_name (the item's link to that shop, else a new link without a page priced with what was paid); and the restocking ends. Neither price nor shop given: the cheapest priced link (else the first), at its price. Works whether or not it was marked to order. Call with dry_run true first.",
  input: z.strictObject({
    item_id: z.number().describe("The workshop item (list_workshop_items)."),
    quantity: z.number().optional().describe("Units or containers received (integer ≥ 1)."),
    unit_price_cents: z
      .number()
      .nullable()
      .optional()
      .describe("Price paid for one unit or container, euro cents."),
    received_on: z.string().optional().describe("YYYY-MM-DD, today or before (default today)."),
    link_id: z.number().optional().describe("purchase_links[].link_id of this item."),
    shop_name: z.string().optional().describe('Where it was bought: "Decathlon".'),
    dry_run: dryRunInput,
  }),
  run: (
    ctx,
    {
      item_id: itemId,
      quantity,
      unit_price_cents: price,
      received_on: receivedOn,
      link_id: linkId,
      shop_name: shopName,
      dry_run: dryRun,
    },
  ) => {
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
    const day = receivedOn ?? today();
    const errors = sourceErrors(item, { day, linkId, shopName });
    if (errors.length) return refused(errors, REFUSED);
    // Nothing said: the cheapest priced link (else the first), at its price, as the app does.
    const link = defaultPurchaseLink(item.purchaseLinks);
    const source: PurchaseSource =
      linkId != null
        ? { linkId }
        : shopName != null
          ? { shopName: cleanName(shopName) }
          : price === undefined && link
            ? { linkId: link.id }
            : null;
    const change =
      item.kind === "product"
        ? containersChange(item.containers, wanted, "purchase")
        : ({ kind: "purchase", quantityDelta: wanted, levelAfter: null } as const);
    if (!change) return refused([{ field: "quantity", message: "Quantité invalide." }], REFUSED);
    const chosen =
      source && "linkId" in source ? item.purchaseLinks.find((l) => l.id === source.linkId) : null;
    // No price given: the price of the link it went through, when known.
    const unitCostCents = price !== undefined ? price : (chosen?.priceCents ?? null);
    const before = formatItemStock(item);
    const write = () => {
      const outcome = receiveItem(ctx, item.id, {
        quantity: wanted,
        levelAfter: change.levelAfter,
        unitCostCents,
        source,
        at: eventInstant(day, Date.now(), getEnv().timeZone),
        on: day,
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

/** A purchase's day and shop as the tools take them (D-111): refusals name the field. */
function sourceErrors(
  item: { purchaseLinks: { id: number }[] },
  args: { day: string; linkId?: number; shopName?: string },
): FieldError[] {
  const errors: FieldError[] = [];
  if (!isLocalDate(args.day)) {
    errors.push({ field: "received_on", message: "Date invalide : AAAA-MM-JJ." });
  } else if (args.day > today()) {
    errors.push({ field: "received_on", message: "La date ne peut pas être dans le futur." });
  }
  if (args.linkId != null && args.shopName != null) {
    errors.push({ field: "shop_name", message: "Indique link_id ou shop_name, pas les deux." });
  }
  if (args.linkId != null && !item.purchaseLinks.some((link) => link.id === args.linkId)) {
    errors.push({ field: "link_id", message: "Ce lien n'appartient pas à cet objet." });
  }
  if (args.shopName != null && !cleanName(args.shopName)) {
    errors.push({ field: "shop_name", message: "Indique la boutique." });
  } else if (args.shopName != null && cleanName(args.shopName).length > 100) {
    errors.push({ field: "shop_name", message: "100 caractères au maximum." });
  }
  return errors;
}

// --- list_workshop_history (D-111) ---------------------------------------------------------------

/** One movement of the workshop's history as the tools answer it (D-111). */
function describeEntry(entry: WorkshopHistoryEntryVM, item: HistoryItemVM) {
  return {
    movement_id: entry.id,
    on: entry.on,
    /** purchase, use, correction or added (the app's Achats, Utilisations, Corrections, Ajouts). */
    group: entry.group,
    movement_kind: entry.kind,
    item: { id: item.id, name: item.name, kind: item.kind, archived: item.archived },
    quantity_delta: entry.quantityDelta,
    /** In French, as the history shows it. */
    summary_text: movementSummary(item, entry),
    unit_price_cents: entry.kind === "purchase" ? (entry.unitCostCents ?? null) : null,
    total_cents:
      entry.kind === "purchase" && entry.unitCostCents != null
        ? entry.unitCostCents * entry.quantityDelta
        : null,
    shop_name: entry.kind === "purchase" ? entry.source : null,
    link_id: entry.kind === "purchase" ? (entry.purchaseLinkId ?? null) : null,
    level_before: entry.levelBefore ?? null,
    level_after: entry.levelAfter ?? null,
    maintenance: entry.maintenance
      ? {
          bike_id: entry.maintenance.bikeId,
          event_id: entry.maintenance.eventId ?? null,
          title: entry.maintenance.title,
        }
      : null,
    note: entry.detail,
    /** false: made by maintenance, changed through its event (update_maintenance). */
    editable: entry.maintenance == null,
  };
}

function loadHistory(ctx: AccessContext) {
  const garage = loadGarage(ctx);
  const history = workshopHistory(garage.items, archivedItems(ctx, garage));
  return { history, items: new Map(history.items.map((item) => [item.id, item])) };
}

const listWorkshopHistoryTool = defineTool({
  name: "list_workshop_history",
  title: "Historique de l'atelier",
  kind: "read",
  description:
    'The workshop\'s history, as its "Historique" tab: every movement of every item, archived ones included, newest first (by day). group: purchase (with unit_price_cents, total_cents, shop_name), use (a part fitted, a product\'s level going down, a container finished, with maintenance when an event made it), correction (a count, a level raised, a tool\'s possession), added (the stock typed when the item was added). Filters combine: item_id, groups, item_kind, from and to (days, inclusive), bike_id (items serving that bike, or a use on it), query (name, brand, reference, category or place). spending: what the purchases matched cost (those without a price counted apart). Answers "when did I buy…", "how fast does this oil go". A wrong day, price or shop, or an addition that was a purchase: update_movement.',
  input: z.strictObject({
    item_id: z.number().optional().describe("One item (list_workshop_items, include_archived)."),
    groups: z
      .array(z.enum(["purchase", "use", "correction", "added"]))
      .optional()
      .describe("Only these groups (default all)."),
    item_kind: z.enum(INVENTORY_KINDS).optional().describe("part, product or tool."),
    from: z.string().optional().describe("YYYY-MM-DD: from this day."),
    to: z.string().optional().describe("YYYY-MM-DD: up to this day."),
    bike_id: z.number().optional().describe("Items serving this bike, or used on it."),
    query: z.string().optional().describe("Words in the item's name, brand, reference or place."),
    ...pageInput,
  }),
  run: (
    ctx,
    { item_id: itemId, groups, item_kind: itemKind, from, to, bike_id: bikeId, query, ...page },
  ) => {
    const errors: FieldError[] = [];
    if (from != null && !isLocalDate(from))
      errors.push({ field: "from", message: "Date invalide : AAAA-MM-JJ." });
    if (to != null && !isLocalDate(to))
      errors.push({ field: "to", message: "Date invalide : AAAA-MM-JJ." });
    if (bikeId != null && !getBike(ctx, bikeId)) {
      errors.push({ field: "bike_id", message: "Vélo introuvable." });
    }
    const { history, items } = loadHistory(ctx);
    if (itemId != null && !items.has(itemId)) {
      errors.push({ field: "item_id", message: "Objet introuvable." });
    }
    if (errors.length) return refused(errors, "The history could not be read.");
    const words = query ? nameKey(query) : "";
    const matching = history.entries.filter((entry) => {
      const item = items.get(entry.itemId)!;
      return (
        (itemId == null || entry.itemId === itemId) &&
        (!groups?.length || groups.includes(entry.group)) &&
        (itemKind == null || item.kind === itemKind) &&
        (from == null || entry.on >= from) &&
        (to == null || entry.on <= to) &&
        (bikeId == null ||
          item.bikes === "all" ||
          item.bikes.includes(bikeId) ||
          entry.maintenance?.bikeId === bikeId) &&
        (!words || nameKey(`${item.name} ${item.searchText}`).includes(words))
      );
    });
    const spending = spendingOf(matching);
    const { items: slice, next_cursor } = paginate(matching, (entry) => String(entry.id), page);
    return answer(`${slice.length} of ${matching.length} workshop movements.`, {
      entries: slice.map((entry) => describeEntry(entry, items.get(entry.itemId)!)),
      spending: {
        purchases: spending.count,
        total_cents: spending.totalCents,
        unpriced: spending.unpriced,
      },
      next_cursor,
      history_url: `${workshopUrl()}?tab=history${itemId != null ? `&of=${itemId}` : ""}`,
    });
  },
});

// --- update_movement (D-111) ---------------------------------------------------------------------

const MOVEMENT_REFUSED = "The movement was refused; nothing was written.";

const updateMovementTool = defineTool({
  name: "update_movement",
  title: "Modifier le mouvement",
  kind: "write",
  description:
    "Corrects a movement of the workshop's history, as \"Modifier le mouvement\": occurred_on (its day, today or before; the stock and a product's level never change with it), note, and for a purchase unit_price_cents and where it was bought (link_id: one of the item's purchase_links, null: not said; or shop_name: the item's link to that shop, else a new link without a page priced with what was paid). as_purchase true makes an addition (group added, the stock typed when the item was added) a purchase of the same quantity, on occurred_on: ask the owner when, where and at what price. Only the fields given change. A movement made by maintenance (editable false) changes through its event. Call with dry_run true first.",
  input: z.strictObject({
    movement_id: z.number().describe("list_workshop_history's movement_id."),
    occurred_on: z.string().optional().describe("YYYY-MM-DD, today or before."),
    note: z.string().nullable().optional(),
    unit_price_cents: z.number().nullable().optional().describe("Purchase: price of one unit."),
    link_id: z.number().nullable().optional().describe("Purchase: purchase_links[].link_id."),
    shop_name: z.string().optional().describe('Purchase: where it was bought, "Decathlon".'),
    as_purchase: z.boolean().optional().describe("An addition becomes a purchase."),
    dry_run: dryRunInput,
  }),
  run: (
    ctx,
    {
      movement_id: movementId,
      occurred_on: occurredOn,
      note,
      unit_price_cents: price,
      link_id: linkId,
      shop_name: shopName,
      as_purchase: asPurchase = false,
      dry_run: dryRun,
    },
  ) => {
    const { history, items } = loadHistory(ctx);
    const entry = history.entries.find((e) => e.id === movementId);
    if (!entry) {
      return refused(
        [{ field: "movement_id", message: "Mouvement introuvable." }],
        "Unknown movement.",
      );
    }
    const item = items.get(entry.itemId)!;
    if (entry.maintenance) {
      return refused(
        [
          {
            field: "movement_id",
            message: "Ce mouvement vient d'un entretien : il se modifie depuis l'entretien.",
          },
        ],
        MOVEMENT_REFUSED,
      );
    }
    const buying = asPurchase && entry.kind === "initial";
    const isPurchase = entry.kind === "purchase" || buying;
    const errors: FieldError[] = [];
    if (asPurchase && !(entry.kind === "initial" && entry.quantityDelta > 0)) {
      errors.push({
        field: "as_purchase",
        message: "Seul un ajout avec du stock devient un achat.",
      });
    }
    if (!isPurchase) {
      for (const [field, value] of [
        ["unit_price_cents", price],
        ["link_id", linkId],
        ["shop_name", shopName],
      ] as const) {
        if (value !== undefined)
          errors.push({ field, message: "Seul un achat a un prix et une boutique." });
      }
    }
    if (price != null && (!Number.isInteger(price) || price < 0 || price > 100_000_000)) {
      errors.push({
        field: "unit_price_cents",
        message: "Prix invalide : en centimes, entier positif.",
      });
    }
    if (note != null && note.trim().length > 500) {
      errors.push({ field: "note", message: "500 caractères au maximum." });
    }
    const day = occurredOn ?? entry.on;
    errors.push(
      ...sourceErrors(
        { purchaseLinks: item.links },
        { day, linkId: linkId ?? undefined, shopName },
      ).map((error) =>
        error.field === "received_on" ? { ...error, field: "occurred_on" } : error,
      ),
    );
    if (errors.length) return refused(errors, MOVEMENT_REFUSED);

    const source: PurchaseSource =
      linkId !== undefined
        ? linkId == null
          ? null
          : { linkId }
        : shopName != null
          ? { shopName: cleanName(shopName) }
          : entry.purchaseLinkId != null
            ? { linkId: entry.purchaseLinkId }
            : null;
    const { timeZone } = getEnv();
    const write = () => {
      const outcome = updateMovement(ctx, entry.id, {
        at: day === entry.on ? null : eventInstant(day, Date.now(), timeZone),
        note: note !== undefined ? note?.trim() || null : entry.detail,
        asPurchase: buying,
        unitCostCents: price !== undefined ? price : (entry.unitCostCents ?? null),
        source,
        on: day,
      });
      if (!outcome.ok) {
        throw new ToolRefusal(
          [{ field: "movement_id", message: "Mouvement introuvable." }],
          MOVEMENT_REFUSED,
        );
      }
      const after = loadHistory(ctx);
      const updated = after.history.entries.find((e) => e.id === entry.id)!;
      return describeEntry(updated, after.items.get(updated.itemId)!);
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_movement", { movement_id: entry.id });
    const summary = `${item.name}: ${result.summary_text} on ${result.on}`;
    return answer(dryRun ? `Dry run: ${summary}. Nothing was written.` : `${summary}.`, {
      dry_run: dryRun,
      movement: result,
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
  listWorkshopHistoryTool,
  updateMovementTool,
];

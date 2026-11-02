"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formatCount } from "@/lib/format";
import { formatItemStock, movementTitle } from "@/lib/display";
import { PRODUCT_LEVELS } from "@/lib/enums";
import { PRODUCT_LEVEL_LABELS } from "@/lib/labels";
import { requireAccessContext } from "@/server/auth/context";
import {
  addMovement,
  addPurchaseLink,
  createItem,
  listInventory,
  receiveItem,
  setItemArchived,
  setRestock,
  setToolOwned,
  undoMovement,
  undoReceive,
  updateItem,
  type InventoryItem,
  type RestockFields,
} from "@/server/db";
import {
  containersChange,
  itemStock,
  levelChange,
  ownedChange,
  stockQuantity,
  type ItemStock,
  type StockChange,
} from "@/server/domain/inventory";
import { today } from "@/server/time";
import { stockVM } from "@/server/views/workshop";
import {
  count,
  itemData,
  itemId as id,
  itemInputSchema,
  itemOpening,
  pageUrl,
  priceCents,
} from "./workshop-input";

// The workshop's actions (feature 8, D-33 to D-42; products and tools, D-85). Stock moves by
// movements only (D-39); each change answers with what "Annuler" needs (D-60).

type Result = { ok: true; message: string } | { ok: false; error: string };
type Change = { ok: true; message: string; undo: UndoToken } | { ok: false; error: string };
export type UndoToken =
  | { kind: "movement"; movementId: number }
  | { kind: "restock"; itemId: number; previous: RestockFields }
  | { kind: "receive"; itemId: number; movementId: number; previous: RestockFields }
  | { kind: "owned"; itemId: number; movementId: number; previous: RestockFields }
  | { kind: "archive"; itemId: number };

const NOT_FOUND = { ok: false, error: "Objet introuvable." } as const;

/** "Ajouter un objet" (`itemId` null) and "Modifier l'objet" (kind, stock and links unchanged). */
export async function saveItemAction(itemId: unknown, input: unknown): Promise<Result> {
  const ctx = await requireAccessContext();
  const parsedId = id.nullable().safeParse(itemId);
  const parsed = itemInputSchema.safeParse(input);
  if (!parsedId.success) return NOT_FOUND;
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;
  if (parsedId.data == null) {
    const link = data.link && (data.link.shopName || data.link.url) ? data.link : null;
    const outcome = createItem(ctx, {
      ...itemData(data),
      kind: data.kind,
      ...itemOpening(data),
      link: link
        ? {
            shop: link.shopName
              ? { name: link.shopName, kind: link.url ? "online" : "physical" }
              : null,
            url: link.url,
            priceCents: link.priceCents,
          }
        : null,
      at: Date.now(),
      today: today(),
    });
    if (!outcome.ok) return { ok: false, error: "Vélo introuvable." };
    refresh();
    return { ok: true, message: `Nouvel objet dans l'atelier : ${data.name}` };
  }
  const current = currentItem(ctx, parsedId.data);
  if (!current) return NOT_FOUND;
  if (current.kind !== data.kind) return { ok: false, error: "Le type d'un objet ne change pas." };
  if (!updateItem(ctx, current.id, itemData(data)).ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: `Objet enregistré : ${data.name}` };
}

function currentItem(ctx: Parameters<typeof listInventory>[0], itemId: number) {
  return listInventory(ctx).find((item) => item.id === itemId) ?? null;
}

/** The stock once a change is applied, to say it in the toast. */
function after(stock: ItemStock, change: StockChange): ItemStock {
  switch (stock.kind) {
    case "part":
      return { kind: "part", quantity: stock.quantity + change.quantityDelta };
    case "product": {
      const containers = stock.containers + change.quantityDelta;
      return {
        kind: "product",
        containers,
        level: containers === 0 ? "empty" : (change.levelAfter ?? stock.level),
      };
    }
    case "tool":
      return { kind: "tool", owned: stock.owned || change.quantityDelta > 0 };
  }
}

const inWords = (item: InventoryItem, stock: ItemStock) => formatItemStock(stockVM(item, stock));

/** Writes one movement by hand and answers with its undo (D-60). */
function record(
  ctx: Parameters<typeof listInventory>[0],
  item: InventoryItem,
  change: StockChange,
  message: string,
  note: string | null = null,
): Change {
  const outcome = addMovement(ctx, item.id, {
    ...change,
    unitCostCents: null,
    note,
    at: Date.now(),
  });
  if (!outcome.ok) return NOT_FOUND;
  refresh();
  return { ok: true, message, undo: { kind: "movement", movementId: outcome.movementId } };
}

/** "−" (a use) or "+" (a purchase) from the item page: units of a part, containers of a product. */
export async function moveItemAction(itemId: unknown, delta: unknown): Promise<Change> {
  const ctx = await requireAccessContext();
  const parsed = z
    .object({ itemId: id, delta: z.union([z.literal(1), z.literal(-1)]) })
    .safeParse({ itemId, delta });
  if (!parsed.success) return NOT_FOUND;
  const item = currentItem(ctx, parsed.data.itemId);
  if (!item) return NOT_FOUND;
  const stock = itemStock(item.kind, item.movements);
  const kind = parsed.data.delta < 0 ? "use" : "purchase";
  if (stock.kind === "tool") {
    return { ok: false, error: "Un outil se note « Je l'ai » ou « Je ne l'ai pas »." };
  }
  if (stock.kind === "part") {
    if (parsed.data.delta < 0 && stock.quantity < 1) {
      return { ok: false, error: "Le stock est déjà à zéro." };
    }
    const change = { kind, quantityDelta: parsed.data.delta, levelAfter: null } as const;
    return record(
      ctx,
      item,
      change,
      `${kind === "use" ? "Utilisation notée" : "Achat noté"} · ${item.name} : ${inWords(item, after(stock, change))}`,
    );
  }
  const change = containersChange(stock.containers, parsed.data.delta, kind);
  if (!change) return { ok: false, error: "Il n'en reste plus en stock." };
  const vm = stockVM(item, stock);
  const title =
    kind === "use"
      ? movementTitle("product", change, vm.kind === "product" ? vm.container : undefined)
      : "Achat noté";
  return record(
    ctx,
    item,
    change,
    `${title} · ${item.name} : ${inWords(item, after(stock, change))}`,
  );
}

/** A product's open container: its level picked by eye, or "Vide" (D-85). */
export async function setLevelAction(itemId: unknown, level: unknown): Promise<Change> {
  const ctx = await requireAccessContext();
  const parsed = z.object({ itemId: id, level: z.enum(PRODUCT_LEVELS) }).safeParse({
    itemId,
    level,
  });
  if (!parsed.success) return NOT_FOUND;
  const item = currentItem(ctx, parsed.data.itemId);
  if (!item || item.kind !== "product") return NOT_FOUND;
  const stock = itemStock(item.kind, item.movements);
  if (stock.kind !== "product") return NOT_FOUND;
  if (stock.containers < 1) {
    return { ok: false, error: "Il n'en reste plus : ajoute d'abord un contenant." };
  }
  const change = levelChange(stock, parsed.data.level);
  if (!change) return { ok: false, error: "C'est déjà son niveau." };
  const next = after(stock, change);
  if (parsed.data.level !== "empty") {
    return record(
      ctx,
      item,
      change,
      `Niveau noté · ${item.name} : ${PRODUCT_LEVEL_LABELS[parsed.data.level].toLowerCase()}`,
    );
  }
  const vm = stockVM(item, next);
  const left =
    next.kind === "product" && next.containers > 0 && vm.kind === "product"
      ? `il en reste ${formatCount(next.containers, ...vm.container)}`
      : "il n'en reste plus";
  return record(ctx, item, change, `Vide · ${item.name} : ${left}`);
}

/** "Je l'ai" / "Je ne l'ai pas" on a tool (D-85); "Je l'ai" ends a restocking in progress. */
export async function setOwnedAction(itemId: unknown, owned: unknown): Promise<Change> {
  const ctx = await requireAccessContext();
  const parsed = z.object({ itemId: id, owned: z.boolean() }).safeParse({ itemId, owned });
  if (!parsed.success) return NOT_FOUND;
  const item = currentItem(ctx, parsed.data.itemId);
  if (!item || item.kind !== "tool") return NOT_FOUND;
  const change = ownedChange(stockQuantity(item.movements), parsed.data.owned);
  if (!change) return { ok: false, error: "C'est déjà noté." };
  const outcome = setToolOwned(ctx, item.id, {
    quantityDelta: change.quantityDelta,
    at: Date.now(),
  });
  if (!outcome.ok) return NOT_FOUND;
  refresh();
  return {
    ok: true,
    message: `${item.name} : ${parsed.data.owned ? "dans l'atelier" : "plus dans l'atelier"}`,
    undo: {
      kind: "owned",
      itemId: item.id,
      movementId: outcome.movementId,
      previous: outcome.previous,
    },
  };
}

/** "Corriger le stock" after a count: the difference becomes an adjustment (D-39). */
export async function correctStockAction(
  itemId: unknown,
  counted: unknown,
): Promise<{ ok: true; message: string; undo: UndoToken | null } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = z.object({ itemId: id, counted: count }).safeParse({ itemId, counted });
  if (!parsed.success) return { ok: false, error: "Quantité invalide." };
  const item = currentItem(ctx, parsed.data.itemId);
  if (!item) return NOT_FOUND;
  const stock = itemStock(item.kind, item.movements);
  if (stock.kind === "tool") {
    return { ok: false, error: "Un outil se note « Je l'ai » ou « Je ne l'ai pas »." };
  }
  const current = stock.kind === "part" ? stock.quantity : stock.containers;
  const delta = parsed.data.counted - current;
  if (delta === 0) return { ok: true, message: "Stock inchangé", undo: null };
  const change =
    stock.kind === "part"
      ? ({ kind: "adjustment", quantityDelta: delta, levelAfter: null } as const)
      : containersChange(stock.containers, delta, "adjustment");
  if (!change) return { ok: false, error: "Quantité invalide." };
  return record(
    ctx,
    item,
    change,
    `Stock corrigé · ${item.name} : ${inWords(item, after(stock, change))}`,
    "Corrigé après un comptage",
  );
}

/**
 * Restocking (D-33, D-42): to order, ordered, received (a purchase), or cancelled. A tool is
 * bought one at a time, and only when it is not owned (D-85).
 */
export async function restockAction(
  itemId: unknown,
  to: unknown,
  quantity: unknown,
): Promise<Change> {
  const ctx = await requireAccessContext();
  const parsed = z
    .object({
      itemId: id,
      to: z.enum(["to_order", "ordered", "received", "none"]),
      quantity: z.number().int().min(1).max(10_000),
    })
    .safeParse({ itemId, to, quantity });
  if (!parsed.success) return { ok: false, error: "Quantité invalide." };
  const item = currentItem(ctx, parsed.data.itemId);
  if (!item) return NOT_FOUND;
  const stock = itemStock(item.kind, item.movements);
  const wanted = stock.kind === "tool" ? 1 : parsed.data.quantity;
  if (stock.kind === "tool" && stock.owned && parsed.data.to !== "none") {
    return { ok: false, error: "Tu as déjà cet outil : note d'abord « Je ne l'ai pas »." };
  }
  const day = today();

  if (parsed.data.to === "received") {
    // The price of the cheapest link, when one is known.
    const link = item.links
      .filter((l) => l.priceCents != null)
      .sort((a, b) => a.priceCents! - b.priceCents!)[0];
    const change =
      stock.kind === "product"
        ? containersChange(stock.containers, wanted, "purchase")
        : ({ kind: "purchase", quantityDelta: wanted, levelAfter: null } as const);
    if (!change) return { ok: false, error: "Quantité invalide." };
    const outcome = receiveItem(ctx, item.id, {
      quantity: wanted,
      levelAfter: change.levelAfter,
      unitCostCents: link?.priceCents ?? null,
      purchaseLinkId: link?.id ?? null,
      at: Date.now(),
    });
    if (!outcome.ok) return NOT_FOUND;
    refresh();
    return {
      ok: true,
      message: `Réception notée · ${item.name} : ${inWords(item, after(stock, change))}`,
      undo: {
        kind: "receive",
        itemId: item.id,
        movementId: outcome.movementId,
        previous: outcome.previous,
      },
    };
  }
  const outcome = setRestock(ctx, item.id, {
    status: parsed.data.to,
    quantity: parsed.data.to === "none" ? null : wanted,
    changedOn: parsed.data.to === "none" ? null : day,
  });
  if (!outcome.ok) return NOT_FOUND;
  refresh();
  const label = { to_order: "À commander", ordered: "En commande", none: "Rachat annulé" }[
    parsed.data.to
  ];
  return {
    ok: true,
    message: `${label} : ${item.name}`,
    undo: { kind: "restock", itemId: item.id, previous: outcome.previous },
  };
}

/** "Ajouter un lien d'achat" (D-09: shown, never fetched). */
export async function addLinkAction(itemId: unknown, input: unknown): Promise<Result> {
  const ctx = await requireAccessContext();
  const parsed = z
    .object({
      itemId: id,
      shopName: z
        .string()
        .trim()
        .max(100, "100 caractères au maximum.")
        .nullable()
        .transform((value) => value || null),
      url: pageUrl,
      priceCents,
    })
    .refine((link) => link.shopName || link.url, {
      error: "Indique la boutique ou l'adresse de la page.",
    })
    .safeParse({ itemId, ...(typeof input === "object" && input ? input : {}) });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const link = parsed.data;
  const outcome = addPurchaseLink(ctx, link.itemId, {
    shop: link.shopName ? { name: link.shopName, kind: link.url ? "online" : "physical" } : null,
    url: link.url,
    priceCents: link.priceCents,
    notedOn: today(),
  });
  if (!outcome.ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Lien d'achat ajouté" };
}

/** "Archiver": the item leaves the workshop; its history stays (never deleted). */
export async function archiveItemAction(itemId: unknown): Promise<Change> {
  const ctx = await requireAccessContext();
  const parsed = id.safeParse(itemId);
  if (!parsed.success || !setItemArchived(ctx, parsed.data, Date.now()).ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: "Objet archivé", undo: { kind: "archive", itemId: parsed.data } };
}

const restockFields = z.object({
  status: z.enum(["none", "to_order", "ordered"]),
  quantity: z.number().int().positive().nullable(),
  changedOn: z.string().nullable(),
});

/** "Annuler" after any workshop change (D-60). */
export async function undoWorkshopAction(token: unknown): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const withMovement = { itemId: id, movementId: id, previous: restockFields };
  const parsed = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("movement"), movementId: id }),
      z.object({ kind: z.literal("restock"), itemId: id, previous: restockFields }),
      z.object({ kind: z.literal("receive"), ...withMovement }),
      z.object({ kind: z.literal("owned"), ...withMovement }),
      z.object({ kind: z.literal("archive"), itemId: id }),
    ])
    .safeParse(token);
  if (!parsed.success) return { message: "Rien à annuler." };
  const undo = parsed.data;
  const outcome =
    undo.kind === "movement"
      ? undoMovement(ctx, undo.movementId)
      : undo.kind === "restock"
        ? setRestock(ctx, undo.itemId, undo.previous)
        : undo.kind === "receive" || undo.kind === "owned"
          ? undoReceive(ctx, undo.itemId, undo.movementId, undo.previous)
          : setItemArchived(ctx, undo.itemId, null);
  if (!outcome.ok) return { message: "Rien à annuler." };
  refresh();
  return { message: "Modification annulée" };
}

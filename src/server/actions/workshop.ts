"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formatStock } from "@/lib/display";
import { COMPONENT_TYPE_CODES, INVENTORY_CATEGORIES, INVENTORY_UNITS } from "@/lib/enums";
import { cleanName } from "@/lib/names";
import { requireAccessContext } from "@/server/auth/context";
import {
  addMovement,
  addPurchaseLink,
  createItem,
  listInventory,
  receiveItem,
  setItemArchived,
  setRestock,
  undoMovement,
  undoReceive,
  updateItem,
  type RestockFields,
} from "@/server/db";
import { stockQuantity } from "@/server/domain/inventory";
import { today } from "@/server/time";

// The workshop's actions (feature 8, D-33 to D-42). Stock moves by movements only (D-39); each
// change answers with what "Annuler" needs (D-60).

type Result = { ok: true; message: string } | { ok: false; error: string };
export type UndoToken =
  | { kind: "movement"; movementId: number }
  | { kind: "restock"; itemId: number; previous: RestockFields }
  | { kind: "receive"; itemId: number; movementId: number; previous: RestockFields }
  | { kind: "archive"; itemId: number };

const id = z.number().int().positive();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => value || null);
const count = z.number().int().min(0).max(10_000);
/** Only http(s) pages: shown and opened in a new tab, never fetched by the server (D-09). */
const pageUrl = z
  .url({ protocol: /^https?$/, error: "Adresse invalide : elle doit commencer par https://" })
  .max(2000)
  .nullable();

const itemSchema = z.object({
  name: z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(1, "Donne un nom à l'objet.").max(120, "120 caractères au maximum.")),
  brand: text(60),
  reference: text(60),
  category: z.enum(INVENTORY_CATEGORIES),
  componentTypeCode: z.enum(COMPONENT_TYPE_CODES).nullable(),
  bikes: z.union([z.literal("all"), z.array(id).max(50)]),
  quantity: count,
  unit: z.enum(INVENTORY_UNITS),
  lowStockThreshold: count.nullable(),
  location: text(120),
  link: z
    .object({
      shopName: text(100),
      url: pageUrl,
      priceCents: z.number().int().min(0).max(100_000_000).nullable(),
    })
    .nullable(),
  notes: text(2000),
});

function itemData(input: z.infer<typeof itemSchema>) {
  return {
    name: input.name,
    brand: input.brand,
    reference: input.reference,
    category: input.category,
    componentTypeCode: input.componentTypeCode,
    allBikes: input.bikes === "all",
    bikeIds: input.bikes === "all" ? [] : input.bikes,
    unit: input.unit,
    lowStockThreshold: input.lowStockThreshold,
    location: input.location,
    notes: input.notes,
  };
}

/** "Ajouter un objet" (`itemId` null) and "Modifier l'objet" (stock and links unchanged). */
export async function saveItemAction(itemId: unknown, input: unknown): Promise<Result> {
  const ctx = await requireAccessContext();
  const parsedId = id.nullable().safeParse(itemId);
  const parsed = itemSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, error: "Objet introuvable." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;
  if (parsedId.data == null) {
    const link = data.link && (data.link.shopName || data.link.url) ? data.link : null;
    const outcome = createItem(ctx, {
      ...itemData(data),
      initialQuantity: data.quantity,
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
  if (!updateItem(ctx, parsedId.data, itemData(data)).ok) {
    return { ok: false, error: "Objet introuvable." };
  }
  refresh();
  return { ok: true, message: `Objet enregistré : ${data.name}` };
}

function currentItem(ctx: Parameters<typeof listInventory>[0], itemId: number) {
  return listInventory(ctx).find((item) => item.id === itemId) ?? null;
}

/** "−" (a use) or "+" (a purchase) from the item page. */
export async function moveItemAction(
  itemId: unknown,
  delta: unknown,
): Promise<{ ok: true; message: string; undo: UndoToken } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = z.object({ itemId: id, delta: z.union([z.literal(1), z.literal(-1)]) }).safeParse({
    itemId,
    delta,
  });
  if (!parsed.success) return { ok: false, error: "Objet introuvable." };
  const item = currentItem(ctx, parsed.data.itemId);
  if (!item) return { ok: false, error: "Objet introuvable." };
  const quantity = stockQuantity(item.movements);
  if (parsed.data.delta < 0 && quantity < 1)
    return { ok: false, error: "Le stock est déjà à zéro." };
  const outcome = addMovement(ctx, item.id, {
    kind: parsed.data.delta < 0 ? "use" : "purchase",
    quantityDelta: parsed.data.delta,
    unitCostCents: null,
    note: null,
    at: Date.now(),
  });
  if (!outcome.ok) return { ok: false, error: "Objet introuvable." };
  refresh();
  return {
    ok: true,
    message: `${parsed.data.delta < 0 ? "Utilisation notée" : "Achat noté"} · ${item.name} : ${formatStock(quantity + parsed.data.delta, item.unit ?? "piece")}`,
    undo: { kind: "movement", movementId: outcome.movementId },
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
  if (!item) return { ok: false, error: "Objet introuvable." };
  const delta = parsed.data.counted - stockQuantity(item.movements);
  if (delta === 0) return { ok: true, message: "Stock inchangé", undo: null };
  const outcome = addMovement(ctx, item.id, {
    kind: "adjustment",
    quantityDelta: delta,
    unitCostCents: null,
    note: "Corrigé après un comptage",
    at: Date.now(),
  });
  if (!outcome.ok) return { ok: false, error: "Objet introuvable." };
  refresh();
  return {
    ok: true,
    message: `Stock corrigé · ${item.name} : ${formatStock(parsed.data.counted, item.unit ?? "piece")}`,
    undo: { kind: "movement", movementId: outcome.movementId },
  };
}

/** Restocking (D-33, D-42): to order, ordered, received (a purchase), or cancelled. */
export async function restockAction(
  itemId: unknown,
  to: unknown,
  quantity: unknown,
): Promise<{ ok: true; message: string; undo: UndoToken } | { ok: false; error: string }> {
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
  if (!item) return { ok: false, error: "Objet introuvable." };
  const day = today();

  if (parsed.data.to === "received") {
    // The price of the cheapest link, when one is known.
    const link = item.links
      .filter((l) => l.priceCents != null)
      .sort((a, b) => a.priceCents! - b.priceCents!)[0];
    const outcome = receiveItem(ctx, item.id, {
      quantity: parsed.data.quantity,
      unitCostCents: link?.priceCents ?? null,
      purchaseLinkId: link?.id ?? null,
      at: Date.now(),
    });
    if (!outcome.ok) return { ok: false, error: "Objet introuvable." };
    refresh();
    const total = stockQuantity(item.movements) + parsed.data.quantity;
    return {
      ok: true,
      message: `Réception notée · ${item.name} : ${formatStock(total, item.unit ?? "piece")}`,
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
    quantity: parsed.data.to === "none" ? null : parsed.data.quantity,
    changedOn: parsed.data.to === "none" ? null : day,
  });
  if (!outcome.ok) return { ok: false, error: "Objet introuvable." };
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
      shopName: text(100),
      url: pageUrl,
      priceCents: z.number().int().min(0).max(100_000_000).nullable(),
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
  if (!outcome.ok) return { ok: false, error: "Objet introuvable." };
  refresh();
  return { ok: true, message: "Lien d'achat ajouté" };
}

/** "Archiver": the item leaves the workshop; its history stays (never deleted). */
export async function archiveItemAction(
  itemId: unknown,
): Promise<{ ok: true; message: string; undo: UndoToken } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = id.safeParse(itemId);
  if (!parsed.success || !setItemArchived(ctx, parsed.data, Date.now()).ok) {
    return { ok: false, error: "Objet introuvable." };
  }
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
  const parsed = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("movement"), movementId: id }),
      z.object({ kind: z.literal("restock"), itemId: id, previous: restockFields }),
      z.object({ kind: z.literal("receive"), itemId: id, movementId: id, previous: restockFields }),
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
        : undo.kind === "receive"
          ? undoReceive(ctx, undo.itemId, undo.movementId, undo.previous)
          : setItemArchived(ctx, undo.itemId, null);
  if (!outcome.ok) return { message: "Rien à annuler." };
  refresh();
  return { message: "Modification annulée" };
}

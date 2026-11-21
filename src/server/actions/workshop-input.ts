import "server-only";
import { z } from "zod";
import { COMPONENT_TYPE_CODES, INVENTORY_CATEGORIES, INVENTORY_UNITS } from "@/lib/enums";
import { isLocalDate, type LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { ItemData } from "@/server/db";
import { eventInstant } from "@/server/domain/time";
import { getEnv } from "@/server/env";
import { today as todayInTz } from "@/server/time";

// Validation of "Ajouter un objet" and "Modifier l'objet" (D-33, D-85; D-50: clean on the way
// in): the fields every kind has, then the kind's own.

export const itemId = z.number().int().positive();

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => value || null);

/** Units, containers: whole numbers typed by hand. */
export const count = z.number().int().min(0).max(10_000);

export const priceCents = z.number().int().min(0).max(100_000_000).nullable();

/** Only http(s) pages: shown and opened in a new tab, never fetched by the server (D-09). */
export const pageUrl = z
  .url({ protocol: /^https?$/, error: "Adresse invalide : elle doit commencer par https://" })
  .max(2000)
  .nullable();

/** A day of the past, or today (TZ), typed in a sheet: `YYYY-MM-DD`. */
export const pastDay = (message: string) =>
  z
    .string()
    .refine(isLocalDate, "Date invalide.")
    .refine((day) => day <= todayInTz(), message);

/** "Acheté le" (D-111): the day the first stock was bought, or null (an addition, today). */
const purchasedOn = pastDay("La date d'achat ne peut pas être dans le futur.")
  .nullable()
  .optional()
  .transform((day) => day ?? null);

const common = {
  name: z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(1, "Donne un nom à l'objet.").max(120, "120 caractères au maximum.")),
  brand: text(60),
  reference: text(60),
  category: z.enum(INVENTORY_CATEGORIES),
  componentTypeCode: z.enum(COMPONENT_TYPE_CODES).nullable(),
  bikes: z.union([z.literal("all"), z.array(itemId).max(50)]),
  location: text(120),
  link: z.object({ shopName: text(100), url: pageUrl, priceCents }).nullable(),
  notes: text(2000),
  purchasedOn,
};

export const itemInputSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("part"),
    quantity: count,
    unit: z.enum(INVENTORY_UNITS),
    lowStockThreshold: count.nullable(),
  }),
  z.object({
    ...common,
    kind: z.literal("product"),
    /** Containers in stock, the open one included. */
    containers: count,
    level: z.enum(["full", "started", "low"]),
    /** "Flacon " → "flacon": the container's name, in lower case (D-85). */
    containerLabel: text(40).transform((value) => (value ? cleanName(value).toLowerCase() : null)),
  }),
  z.object({ ...common, kind: z.literal("tool"), owned: z.boolean() }),
]);

export type ItemInput = z.infer<typeof itemInputSchema>;

/** The description stored for an item; the fields of the other kinds stay empty. */
export function itemData(input: ItemInput): ItemData {
  return {
    name: input.name,
    brand: input.brand,
    reference: input.reference,
    category: input.category,
    componentTypeCode: input.componentTypeCode,
    allBikes: input.bikes === "all",
    bikeIds: input.bikes === "all" ? [] : input.bikes,
    unit: input.kind === "part" ? input.unit : null,
    lowStockThreshold: input.kind === "part" ? input.lowStockThreshold : null,
    containerLabel: input.kind === "product" ? input.containerLabel : null,
    location: input.location,
    notes: input.notes,
  };
}

/**
 * Its first stock (an `initial` movement): a part's units, a product's containers with the open
 * one's level, an owned tool. A tool not owned goes to "À commander" instead (D-85).
 */
export function itemOpening(input: ItemInput) {
  switch (input.kind) {
    case "part":
      return { initialQuantity: input.quantity, initialLevel: null, toOrder: false };
    case "product":
      return { initialQuantity: input.containers, initialLevel: input.level, toOrder: false };
    case "tool":
      return { initialQuantity: input.owned ? 1 : 0, initialLevel: null, toOrder: !input.owned };
  }
}

/**
 * The link sheet ("Ajouter un lien d'achat", "Modifier le lien d'achat", D-67, D-106) and the
 * MCP's `add_link` and `update_link`: a shop or a page, a price typed by hand.
 */
export const purchaseLinkSchema = z
  .object({ shopName: text(100), url: pageUrl, priceCents })
  .refine((link) => link.shopName || link.url, {
    error: "Indique la boutique ou l'adresse de la page.",
  });

/** A link as the data-access layer stores it: the shop is online when it has a page. */
export function toPurchaseLink(link: z.output<typeof purchaseLinkSchema>, today: LocalDate) {
  return {
    shop: link.shopName
      ? { name: link.shopName, kind: link.url ? ("online" as const) : ("physical" as const) }
      : null,
    url: link.url,
    priceCents: link.priceCents,
    notedOn: today,
  };
}

/**
 * Everything `createItem` needs for a new item: its description, first stock and link; with
 * "Acheté le", the first stock is a purchase on that day (D-61's instant, D-111).
 */
export function newItem(input: ItemInput, at: number, today: LocalDate) {
  const link = input.link && (input.link.shopName || input.link.url) ? input.link : null;
  const opening = itemOpening(input);
  return {
    ...itemData(input),
    kind: input.kind,
    ...opening,
    purchasedAt:
      input.purchasedOn && opening.initialQuantity > 0
        ? eventInstant(input.purchasedOn, at, getEnv().timeZone)
        : null,
    link: link
      ? {
          shop: link.shopName
            ? { name: link.shopName, kind: link.url ? ("online" as const) : ("physical" as const) }
            : null,
          url: link.url,
          priceCents: link.priceCents,
        }
      : null,
    at,
    today,
  };
}

/**
 * Where it was bought (D-111): one of the item's links, a shop typed by name (its link, else a
 * new link without a page), or not said.
 */
export const purchaseSourceSchema = z
  .union([
    z.object({ linkId: itemId }),
    z.object({
      shopName: z
        .string()
        .transform(cleanName)
        .pipe(z.string().min(1, "Indique la boutique.").max(100, "100 caractères au maximum.")),
    }),
  ])
  .nullable();

/** "Reçu" with what was paid (D-111): the day, the unit price, the shop. */
export const receiptSchema = z.object({
  on: pastDay("La date de réception ne peut pas être dans le futur."),
  unitCostCents: priceCents,
  source: purchaseSourceSchema,
});

export type ReceiptInput = z.output<typeof receiptSchema>;

/**
 * "Modifier le mouvement" (D-111): its day, its note; a purchase's unit price and shop; an
 * addition made a purchase (`asPurchase`).
 */
export const movementEditSchema = z.object({
  on: pastDay("La date ne peut pas être dans le futur."),
  note: text(500),
  asPurchase: z.boolean(),
  unitCostCents: priceCents,
  source: purchaseSourceSchema,
});

export type MovementEditInput = z.output<typeof movementEditSchema>;

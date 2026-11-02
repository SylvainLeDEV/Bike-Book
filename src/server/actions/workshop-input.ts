import "server-only";
import { z } from "zod";
import { COMPONENT_TYPE_CODES, INVENTORY_CATEGORIES, INVENTORY_UNITS } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { ItemData } from "@/server/db";

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

/** Everything `createItem` needs for a new item: its description, first stock and link. */
export function newItem(input: ItemInput, at: number, today: LocalDate) {
  const link = input.link && (input.link.shopName || input.link.url) ? input.link : null;
  return {
    ...itemData(input),
    kind: input.kind,
    ...itemOpening(input),
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

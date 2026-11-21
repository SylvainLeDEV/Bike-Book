import type { InventoryKind } from "./enums";
import { writeWorkshopHistoryFilter } from "./workshop-history";

/*
 * The workshop's view kept in the address (D-85, D-86, D-111): the tab (Pièces, Produits,
 * Outils, À racheter, Fiches, Historique), the bike, the search, the item or procedure open; the
 * history's own filters are in `workshop-history.ts` and leave the address with their tab. Pure: the server reads
 * them from the page's query, the browser writes them back in place (`replaceQuery`), so a reload
 * or a shared link shows the same. `?new=1` opens "Nouvelle fiche" once, then leaves the address.
 */

export const WORKSHOP_TABS = [
  "parts",
  "products",
  "tools",
  "rebuy",
  "procedures",
  "history",
] as const;

export type WorkshopTab = (typeof WORKSHOP_TABS)[number];

export type WorkshopView = {
  /** Null: not given, the tab of the item open, else "Pièces". */
  tab: WorkshopTab | null;
  bikeId: number | null;
  query: string;
  itemId: number | null;
  procedureId: number | null;
  /** "Nouvelle fiche pour ce vélo" from the bike page: open the editor on arrival. */
  newProcedure?: boolean;
};

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const id = (value: string | undefined) => {
  const n = Number(value);
  return value && /^\d+$/.test(value) && Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** The tab that lists an item of that kind. */
export function kindTab(kind: InventoryKind): WorkshopTab {
  return { part: "parts", product: "products", tool: "tools" }[kind] as WorkshopTab;
}

/** `?tab=products&bike=2&q=huile&item=12`; invalid values are ignored. */
export function parseWorkshopView(query: Query): WorkshopView {
  const tab = first(query.tab);
  return {
    tab: WORKSHOP_TABS.find((value) => value === tab) ?? null,
    bikeId: id(first(query.bike)),
    query: (first(query.q) ?? "").slice(0, 100),
    itemId: id(first(query.item)),
    procedureId: id(first(query.procedure)),
    newProcedure: first(query.new) === "1",
  };
}

/** Writes the view into `params`; "Pièces", no bike, no search and nothing open are left out. */
export function writeWorkshopView(params: URLSearchParams, view: WorkshopView): void {
  for (const key of ["tab", "bike", "q", "item", "procedure", "new"]) params.delete(key);
  // The history's filters go with their tab (D-111).
  if (view.tab !== "history") writeWorkshopHistoryFilter(params, null);
  if (view.tab && view.tab !== "parts") params.set("tab", view.tab);
  if (view.bikeId != null) params.set("bike", String(view.bikeId));
  if (view.query.trim()) params.set("q", view.query);
  if (view.itemId != null) params.set("item", String(view.itemId));
  if (view.procedureId != null) params.set("procedure", String(view.procedureId));
}
